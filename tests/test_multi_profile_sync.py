"""Multi-profile cloud sync tests.

Verifies that multiple profiles can independently connect
to different cloud accounts and sync in the background.
"""
from pathlib import Path

import pytest

from kaisho.backends import make_backend_for_profile
from kaisho.services import cloud_sync as sync_svc
from kaisho.services import settings as settings_svc


# ── Helpers ──────────────────────────────────────────


def _write_settings(profile_dir: Path, cloud_sync: dict):
    """Write a minimal settings.yaml with cloud sync."""
    settings_file = profile_dir / "settings.yaml"
    settings_svc.save_settings(settings_file, {
        "cloud_sync": cloud_sync,
    })


def _make_profile(data_dir: Path, name: str, **sync):
    """Create a profile directory with cloud settings."""
    profile_dir = data_dir / "profiles" / name
    profile_dir.mkdir(parents=True, exist_ok=True)
    org_dir = profile_dir / "org"
    org_dir.mkdir(exist_ok=True)
    # Create minimal org files
    for f in (
        "clocks.org", "todos.org",
        "customers.org", "inbox.org",
        "notes.org", "archive.org",
    ):
        (org_dir / f).write_text("", encoding="utf-8")
    _write_settings(profile_dir, {
        "enabled": sync.get("enabled", False),
        "url": sync.get("url", ""),
        "api_key": sync.get("api_key", ""),
        "interval": 300,
    })
    return profile_dir


# ── Fixtures ─────────────────────────────────────────


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """Isolated Kaisho data directory."""
    d = tmp_path / ".kaisho"
    d.mkdir()
    # Write user.yaml
    (d / "user.yaml").write_text(
        "name: Test User\nemail: test@example.com\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KAISHO_HOME", str(d))
    monkeypatch.setenv("PROFILE", "alpha")
    from kaisho.config import reset_config
    from kaisho.backends import get_backend
    reset_config()
    get_backend.cache_clear()
    return d


# ── Tests: connect guard removed ─────────────────────


class TestConnectNoGuard:
    """Two profiles can both have cloud sync enabled."""

    def test_both_profiles_enabled(self, data_dir):
        _make_profile(
            data_dir, "alpha",
            enabled=True, url="https://a.dev",
            api_key="key-a",
        )
        _make_profile(
            data_dir, "beta",
            enabled=True, url="https://b.dev",
            api_key="key-b",
        )

        alpha_settings = settings_svc.load_settings(
            data_dir / "profiles/alpha/settings.yaml",
        )
        beta_settings = settings_svc.load_settings(
            data_dir / "profiles/beta/settings.yaml",
        )
        alpha_sync = alpha_settings.get(
            "cloud_sync", {},
        )
        beta_sync = beta_settings.get(
            "cloud_sync", {},
        )
        assert alpha_sync["enabled"] is True
        assert beta_sync["enabled"] is True
        assert alpha_sync["api_key"] != beta_sync["api_key"]


# ── Tests: make_backend_for_profile ──────────────────


class TestBackendFactory:
    """make_backend_for_profile returns isolated backends."""

    def test_creates_backend_for_profile(self, data_dir):
        _make_profile(data_dir, "alpha")
        backend = make_backend_for_profile(
            data_dir, "alpha",
        )
        assert backend.clocks is not None
        assert backend.tasks is not None
        assert backend.inbox is not None

    def test_backends_are_isolated(self, data_dir):
        _make_profile(data_dir, "alpha")
        _make_profile(data_dir, "beta")

        ba = make_backend_for_profile(
            data_dir, "alpha",
        )
        bb = make_backend_for_profile(
            data_dir, "beta",
        )
        assert ba.clocks.data_file != bb.clocks.data_file

    def test_does_not_affect_cached_backend(
        self, data_dir,
    ):
        from kaisho.backends import get_backend
        _make_profile(data_dir, "alpha")
        _make_profile(data_dir, "beta")

        from kaisho.config import reset_config
        reset_config()
        get_backend.cache_clear()
        cached = get_backend()

        uncached = make_backend_for_profile(
            data_dir, "beta",
        )
        cached2 = get_backend()
        assert cached is cached2
        assert uncached.clocks.data_file != (
            cached.clocks.data_file
        )


# ── Tests: run_sync_cycle parameters ────────────────


class TestSyncCycleParams:
    """run_sync_cycle respects backend parameter."""

    def test_explicit_backend_used(
        self, data_dir, monkeypatch,
    ):
        """Passing backend= avoids get_backend() call."""
        profile_dir = _make_profile(
            data_dir, "alpha",
            enabled=True, url="https://a.dev",
            api_key="key-a",
        )
        backend = make_backend_for_profile(
            data_dir, "alpha",
        )

        get_backend_called = []

        def tracking_get_backend():
            get_backend_called.append(True)
            return backend

        monkeypatch.setattr(
            "kaisho.backends.get_backend",
            tracking_get_backend,
        )

        # Stub network
        monkeypatch.setattr(
            sync_svc, "pull_changes",
            lambda *a, **kw: {
                "now": "2026-01-01T00:00:00",
                "cursor": "2026-01-01T00:00:00",
                "entries": [],
                "has_more": False,
            },
        )
        monkeypatch.setattr(
            sync_svc, "push_changes",
            lambda *a, **kw: {
                "inserted": 0, "updated": 0,
                "skipped": 0, "errors": 0,
            },
        )
        monkeypatch.setattr(
            sync_svc, "push_reference_snapshot",
            lambda *a, **kw: False,
        )
        monkeypatch.setattr(
            sync_svc, "_pull_config_updates",
            lambda *a, **kw: None,
        )

        sync_svc.run_sync_cycle(
            cloud_url="https://a.dev",
            api_key="key-a",
            profile_dir=profile_dir,
            backend=backend,
        )
        assert len(get_backend_called) == 0


# ── Tests: multi-profile cron loop ──────────────────


class TestMultiProfileCron:
    """_run_cloud_sync iterates all enabled profiles."""

    def test_syncs_both_profiles(
        self, data_dir, monkeypatch,
    ):
        _make_profile(
            data_dir, "alpha",
            enabled=True, url="https://a.dev",
            api_key="key-a",
        )
        _make_profile(
            data_dir, "beta",
            enabled=True, url="https://b.dev",
            api_key="key-b",
        )

        synced_profiles = []

        def fake_run_sync_cycle(**kwargs):
            synced_profiles.append(kwargs["cloud_url"])
            return {
                "pulled_up": 0, "pulled_del": 0,
                "pushed_live": 0, "pushed_deletes": 0,
                "snapshot_pushed": False, "error": "",
            }

        monkeypatch.setattr(
            sync_svc, "run_sync_cycle",
            fake_run_sync_cycle,
        )

        from kaisho.cron.scheduler import _run_cloud_sync
        _run_cloud_sync()

        assert "https://a.dev" in synced_profiles
        assert "https://b.dev" in synced_profiles

    def test_skips_disabled_profiles(
        self, data_dir, monkeypatch,
    ):
        _make_profile(
            data_dir, "alpha",
            enabled=True, url="https://a.dev",
            api_key="key-a",
        )
        _make_profile(
            data_dir, "beta",
            enabled=False, url="https://b.dev",
            api_key="key-b",
        )

        synced_profiles = []

        def fake_run_sync_cycle(**kwargs):
            synced_profiles.append(kwargs["cloud_url"])
            return {
                "pulled_up": 0, "pulled_del": 0,
                "pushed_live": 0, "pushed_deletes": 0,
                "snapshot_pushed": False, "error": "",
            }

        monkeypatch.setattr(
            sync_svc, "run_sync_cycle",
            fake_run_sync_cycle,
        )

        from kaisho.cron.scheduler import _run_cloud_sync
        _run_cloud_sync()

        assert "https://a.dev" in synced_profiles
        assert "https://b.dev" not in synced_profiles

    def test_error_in_one_does_not_block_other(
        self, data_dir, monkeypatch,
    ):
        _make_profile(
            data_dir, "alpha",
            enabled=True, url="https://a.dev",
            api_key="key-a",
        )
        _make_profile(
            data_dir, "beta",
            enabled=True, url="https://b.dev",
            api_key="key-b",
        )

        synced_profiles = []

        def fake_run_sync_cycle(**kwargs):
            url = kwargs["cloud_url"]
            if url == "https://a.dev":
                raise ConnectionError("network down")
            synced_profiles.append(url)
            return {
                "pulled_up": 0, "pulled_del": 0,
                "pushed_live": 0, "pushed_deletes": 0,
                "snapshot_pushed": False, "error": "",
            }

        monkeypatch.setattr(
            sync_svc, "run_sync_cycle",
            fake_run_sync_cycle,
        )

        from kaisho.cron.scheduler import _run_cloud_sync
        _run_cloud_sync()

        assert "https://b.dev" in synced_profiles

    def test_all_profiles_sync_config(
        self, data_dir, monkeypatch,
    ):
        """All enabled profiles sync (no pull_config
        guard needed since user.yaml is per-profile).
        """
        _make_profile(
            data_dir, "alpha",
            enabled=True, url="https://a.dev",
            api_key="key-a",
        )
        _make_profile(
            data_dir, "beta",
            enabled=True, url="https://b.dev",
            api_key="key-b",
        )

        synced_urls = []

        def fake_run_sync_cycle(**kwargs):
            synced_urls.append(kwargs["cloud_url"])
            # pull_config should NOT be passed
            assert "pull_config" not in kwargs
            return {
                "pulled_up": 0, "pulled_del": 0,
                "pushed_live": 0, "pushed_deletes": 0,
                "snapshot_pushed": False, "error": "",
            }

        monkeypatch.setattr(
            sync_svc, "run_sync_cycle",
            fake_run_sync_cycle,
        )

        from kaisho.cron.scheduler import _run_cloud_sync
        _run_cloud_sync()

        assert "https://a.dev" in synced_urls
        assert "https://b.dev" in synced_urls


# ── Tests: WebSocket reconnect on profile switch ────


class TestWsReconnect:
    """Profile switch triggers WS reconnect."""

    def test_switch_calls_restart_cloud_ws(
        self, data_dir, monkeypatch,
    ):
        _make_profile(data_dir, "alpha")
        _make_profile(data_dir, "beta")

        restart_calls = []
        monkeypatch.setattr(
            "kaisho.cron.scheduler.restart_cloud_ws",
            lambda: restart_calls.append(True),
        )

        from fastapi.testclient import TestClient
        from kaisho.api.app import app
        client = TestClient(
            app, raise_server_exceptions=False,
        )

        resp = client.put(
            "/api/settings/profile",
            json={"profile": "beta"},
        )
        assert resp.status_code == 200
        assert len(restart_calls) == 1


# ── Tests: _ProfileOverlayCfg ───────────────────────


class TestProfileOverlayCfg:
    """Config proxy overrides profile-specific attrs."""

    def test_overrides_profile_attrs(self, data_dir):
        from kaisho.backends import _ProfileOverlayCfg
        from kaisho.config import get_config

        _make_profile(data_dir, "alpha")
        _make_profile(data_dir, "gamma")

        cfg = get_config()
        profile_dir = data_dir / "profiles" / "gamma"
        overlay = _ProfileOverlayCfg(
            cfg, "gamma", profile_dir,
        )

        assert overlay.PROFILE == "gamma"
        assert overlay.PROFILE_DIR == profile_dir
        assert overlay.SETTINGS_FILE == (
            profile_dir / "settings.yaml"
        )
        # Delegated attributes still work
        assert overlay.DATA_DIR == cfg.DATA_DIR


# ── Tests: per-profile user.yaml ────────────────────


class TestPerProfileUserYaml:
    """user.yaml is per-profile, not global."""

    def test_load_from_profile_dir(self, data_dir):
        from kaisho.config import (
            get_config, load_user_yaml, save_user_yaml,
        )
        _make_profile(data_dir, "alpha")
        cfg = get_config()

        save_user_yaml(cfg, {"name": "Alice"})
        user = load_user_yaml(cfg)
        assert user["name"] == "Alice"

        # Stored in profile dir, not data dir
        assert (cfg.PROFILE_DIR / "user.yaml").exists()

    def test_profiles_have_independent_identity(
        self, data_dir,
    ):
        from kaisho.config import (
            get_config, load_user_yaml, save_user_yaml,
        )
        from kaisho.backends import _ProfileOverlayCfg

        _make_profile(data_dir, "alpha")
        _make_profile(data_dir, "beta")

        cfg = get_config()
        alpha_cfg = _ProfileOverlayCfg(
            cfg, "alpha",
            data_dir / "profiles" / "alpha",
        )
        beta_cfg = _ProfileOverlayCfg(
            cfg, "beta",
            data_dir / "profiles" / "beta",
        )

        save_user_yaml(alpha_cfg, {"name": "Alice"})
        save_user_yaml(beta_cfg, {"name": "Bob"})

        assert load_user_yaml(alpha_cfg)["name"] == "Alice"
        assert load_user_yaml(beta_cfg)["name"] == "Bob"

    def test_migration_copies_global_to_profile(
        self, data_dir,
    ):
        """init_data_dir copies global user.yaml into
        a profile that doesn't have one yet.
        """
        import yaml
        from kaisho.config import (
            init_data_dir, load_user_yaml, reset_config,
        )
        from kaisho.backends import get_backend

        # The fixture already wrote a global user.yaml
        # with name "Test User". Create a new profile.
        import os
        os.environ["PROFILE"] = "migrated"
        reset_config()
        get_backend.cache_clear()

        from kaisho.config import get_config
        cfg = get_config()
        init_data_dir(cfg)

        user = load_user_yaml(cfg)
        assert user["name"] == "Test User"
        assert (cfg.PROFILE_DIR / "user.yaml").exists()
