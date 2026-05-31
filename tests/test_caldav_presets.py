"""Tests for the CalDAV preset registry."""
import pytest

from kaisho.services.caldav_presets import (
    PRESETS, get_preset, list_presets, resolve_url,
)


def test_known_preset_ids():
    assert set(PRESETS) == {
        "icloud", "fastmail", "nextcloud", "custom",
    }


def test_list_presets_includes_ids():
    rows = list_presets()
    assert {r["id"] for r in rows} == set(PRESETS)


def test_get_preset_unknown_returns_none():
    assert get_preset("nope") is None


def test_resolve_icloud():
    url = resolve_url("icloud")
    assert url == "https://caldav.icloud.com/"


def test_resolve_fastmail_with_user():
    url = resolve_url(
        "fastmail", username="me@fastmail.com",
    )
    assert url == (
        "https://caldav.fastmail.com/dav/calendars/"
        "user/me@fastmail.com/"
    )


def test_resolve_fastmail_without_user_raises():
    with pytest.raises(ValueError, match="username"):
        resolve_url("fastmail")


def test_resolve_nextcloud_with_host_and_user():
    url = resolve_url(
        "nextcloud", host="cloud.example.com",
        username="rb",
    )
    assert url == (
        "https://cloud.example.com/remote.php/dav/"
        "calendars/rb/"
    )


def test_resolve_nextcloud_missing_host_raises():
    with pytest.raises(ValueError, match="host"):
        resolve_url("nextcloud", username="rb")


def test_resolve_nextcloud_missing_user_raises():
    with pytest.raises(ValueError, match="username"):
        resolve_url("nextcloud", host="cloud.example.com")


def test_resolve_custom_with_url(monkeypatch):
    # Custom-preset URLs now go through an SSRF guard
    # (#124). Stub DNS to a public address so the test
    # validates the happy path without hitting the
    # network.
    import socket
    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda host, port: [
            (socket.AF_INET, 0, 0, "", ("8.8.8.8", 0)),
        ],
    )
    url = resolve_url(
        "custom", url="https://my.dav/calendars/",
    )
    assert url == "https://my.dav/calendars/"


def test_resolve_custom_without_url_raises():
    with pytest.raises(ValueError, match="url"):
        resolve_url("custom")


def test_resolve_unknown_preset_raises():
    with pytest.raises(ValueError, match="unknown preset"):
        resolve_url("nope")
