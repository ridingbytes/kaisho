"""Regression tests for the CalDAV robustness + perf
fixes shipped after #125.

Covers:
  * C6 -- cache TOCTOU: a fetch that started before an
    invalidate must not write its stale result back.
  * C7 -- add_account rolls the keychain back when the
    settings save fails.
  * F10 -- DAVClient is memoised per (account, base_url).
"""
import pytest


@pytest.fixture
def isolated_profile(tmp_path, monkeypatch):
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.delenv("PROFILE", raising=False)
    from kaisho import config
    config.reset_config()
    from kaisho.services import caldav as svc
    svc._cache.clear()
    svc._account_gen.clear()
    svc._client_cache.clear()
    yield tmp_path
    svc._cache.clear()
    svc._account_gen.clear()
    svc._client_cache.clear()
    config.reset_config()


@pytest.fixture
def fake_keyring(monkeypatch):
    store = {}
    import keyring
    monkeypatch.setattr(
        keyring, "set_password",
        lambda s, a, p: store.update({(s, a): p}),
    )
    monkeypatch.setattr(
        keyring, "get_password",
        lambda s, a: store.get((s, a)),
    )
    monkeypatch.setattr(
        keyring, "delete_password",
        lambda s, a: store.pop((s, a), None),
    )
    return store


# -- C6: TOCTOU ------------------------------------------


def test_c6_concurrent_invalidate_drops_stale_write(
    isolated_profile, fake_keyring,
):
    from kaisho.services import caldav as svc

    # Set up an account so generation tracking is wired.
    aid = "ac_toctou"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "x", "preset": "fastmail",
        "url": "https://srv/", "username": "u",
        "enabled_calendars": [],
        "created_at": "2026-05-31T00:00:00",
        "storage": "keyring",
    })
    svc._save_settings(data)

    # Thread A snapshots the generation, then yields.
    gen_a = svc._current_generation(aid)
    # Thread B invalidates while A is still 'fetching'.
    svc._invalidate_cache_for_account(aid)
    # Thread A tries to write back with its stale gen.
    svc._cache_put(
        "ac_toctou|cal|2026-05-31|2026-06-01",
        aid, gen_a, [{"stale": True}],
    )
    # The write must have been refused.
    cached = svc._cache_get(
        "ac_toctou|cal|2026-05-31|2026-06-01",
    )
    assert cached is None


def test_c6_normal_write_succeeds(
    isolated_profile, fake_keyring,
):
    from kaisho.services import caldav as svc
    aid = "ac_normal"
    svc._account_gen[aid] = 0
    gen = svc._current_generation(aid)
    svc._cache_put(
        "ac_normal|cal|x|y",
        aid, gen, [{"fresh": True}],
    )
    cached = svc._cache_get("ac_normal|cal|x|y")
    assert cached == [{"fresh": True}]


# -- C7: keychain rollback on partial write -------------


def test_c7_add_account_rolls_keychain_on_save_failure(
    isolated_profile, fake_keyring, monkeypatch,
):
    from kaisho.services import caldav as svc

    # Stub test_connection so the auth probe does not
    # try to talk to a real server.
    monkeypatch.setattr(
        svc, "test_connection",
        lambda url, user, pw: {
            "ok": True, "principal_url": url,
            "calendar_count": 0,
        },
    )

    # Force _save_settings to blow up after _set_password
    # has already stashed the credential.
    def boom(_data):
        raise OSError("disk full")
    monkeypatch.setattr(svc, "_save_settings", boom)

    with pytest.raises(OSError):
        svc.add_account(
            preset="fastmail",
            username="me@fastmail.com",
            password="rollback-me",
        )

    # No password should be sitting orphaned in the
    # keychain after the failed add.
    remaining = [
        v for (s, _a), v in fake_keyring.items()
        if s == svc.KEYRING_SERVICE
        and v == "rollback-me"
    ]
    assert remaining == [], (
        "_set_password must roll back when "
        "_save_settings raises"
    )


# -- F10: client memoisation ----------------------------


def test_f10_get_client_reuses_per_account_base_url(
    isolated_profile, fake_keyring, monkeypatch,
):
    """Two calls to _get_client with the same account +
    base_url should hand back the same DAVClient
    instance, not pay TCP+TLS+auth twice."""
    from kaisho.services import caldav as svc

    aid = "ac_memo"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "x", "preset": "fastmail",
        "url": "https://srv/", "username": "u",
        "enabled_calendars": [],
        "created_at": "2026-05-31T00:00:00",
        "storage": "keyring",
    })
    svc._save_settings(data)
    import keyring
    keyring.set_password(svc.KEYRING_SERVICE, aid, "pw")

    instantiations = {"n": 0}

    class FakeClient:
        def __init__(self, *_a, **_kw):
            instantiations["n"] += 1

    monkeypatch.setattr(
        "caldav.DAVClient", FakeClient,
    )

    c1 = svc._get_client(aid, "https://srv/")
    c2 = svc._get_client(aid, "https://srv/")
    assert c1 is c2, "client must be memoised"
    assert instantiations["n"] == 1


def test_f10_get_client_distinguishes_base_urls(
    isolated_profile, fake_keyring, monkeypatch,
):
    from kaisho.services import caldav as svc

    aid = "ac_two_urls"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "x", "preset": "icloud",
        "url": "https://caldav.icloud.com/",
        "username": "u",
        "enabled_calendars": [],
        "created_at": "2026-05-31T00:00:00",
        "storage": "keyring",
    })
    svc._save_settings(data)
    import keyring
    keyring.set_password(svc.KEYRING_SERVICE, aid, "pw")

    instantiations = {"n": 0}

    class FakeClient:
        def __init__(self, *_a, **_kw):
            instantiations["n"] += 1

    monkeypatch.setattr(
        "caldav.DAVClient", FakeClient,
    )

    # iCloud routinely redirects to a per-shard host.
    # Each base_url should get its own cached client.
    svc._get_client(aid, "https://caldav.icloud.com/")
    svc._get_client(aid, "https://p49-caldav.icloud.com/")
    assert instantiations["n"] == 2


def test_f10_invalidate_account_drops_cached_client(
    isolated_profile, fake_keyring, monkeypatch,
):
    from kaisho.services import caldav as svc

    aid = "ac_drop"
    data = svc._load_settings()
    data["accounts"].append({
        "id": aid, "label": "x", "preset": "fastmail",
        "url": "https://srv/", "username": "u",
        "enabled_calendars": [],
        "created_at": "2026-05-31T00:00:00",
        "storage": "keyring",
    })
    svc._save_settings(data)
    import keyring
    keyring.set_password(svc.KEYRING_SERVICE, aid, "pw")

    instantiations = {"n": 0}

    class FakeClient:
        def __init__(self, *_a, **_kw):
            instantiations["n"] += 1

    monkeypatch.setattr(
        "caldav.DAVClient", FakeClient,
    )

    svc._get_client(aid, "https://srv/")
    svc._invalidate_cache_for_account(aid)
    svc._get_client(aid, "https://srv/")
    assert instantiations["n"] == 2, (
        "client cache must drop on invalidation"
    )
