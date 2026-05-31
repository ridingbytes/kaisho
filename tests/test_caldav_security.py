"""Regression tests for the CalDAV security hardening
shipped after #124.

Covers:
  * C4 -- CORS allowlist drops localhost:3000.
  * C5 -- custom-preset URL is rejected for non-https
    and for hosts that resolve to internal addresses.
  * S4 -- _scrub_password removes the literal password
    and basic-auth base64 from error strings.
"""
import pytest


# -- C4 --------------------------------------------------


def test_c4_cors_origins_no_localhost_3000():
    """The :3000 entry that any third-party local dev
    server could use to phish CalDAV credentials must
    be gone from the prod allowlist."""
    from kaisho.api import app as app_mod
    assert "http://localhost:3000" not in (
        app_mod._PROD_ORIGINS
    ), (
        "PROD_ORIGINS must not include :3000 -- "
        "see #124 / C4"
    )


def test_c4_cors_origins_keeps_localhost_8765():
    """The Tauri webview does use :8765 in some
    builds; keep it."""
    from kaisho.api import app as app_mod
    assert "http://localhost:8765" in (
        app_mod._PROD_ORIGINS
    )


# -- C5 --------------------------------------------------


def test_c5_custom_url_must_be_https():
    from kaisho.services.caldav_presets import resolve_url
    with pytest.raises(ValueError, match="https"):
        resolve_url("custom", url="http://example.com/dav/")


def test_c5_custom_url_rejects_loopback():
    from kaisho.services.caldav_presets import resolve_url
    with pytest.raises(ValueError, match="internal"):
        resolve_url("custom", url="https://127.0.0.1/dav/")


def test_c5_custom_url_rejects_rfc1918():
    from kaisho.services.caldav_presets import resolve_url
    for ip in ("10.0.0.1", "192.168.1.1", "172.16.0.1"):
        with pytest.raises(ValueError, match="internal"):
            resolve_url("custom", url=f"https://{ip}/dav/")


def test_c5_custom_url_rejects_link_local():
    from kaisho.services.caldav_presets import resolve_url
    with pytest.raises(ValueError, match="internal"):
        resolve_url(
            "custom", url="https://169.254.1.1/dav/",
        )


def test_c5_custom_url_accepts_public_https(monkeypatch):
    """Public hosts pass. Stub socket.getaddrinfo to a
    public address so the test does not depend on DNS."""
    import socket
    from kaisho.services import caldav_presets

    def fake_addrinfo(host, port):
        # 8.8.8.8 -- public.
        return [(socket.AF_INET, 0, 0, "",
                 ("8.8.8.8", 0))]

    monkeypatch.setattr(
        "socket.getaddrinfo", fake_addrinfo,
    )
    out = caldav_presets.resolve_url(
        "custom", url="https://caldav.example.com/dav/",
    )
    assert out == "https://caldav.example.com/dav/"


# -- S4 --------------------------------------------------


def test_s4_scrub_password_removes_literal():
    from kaisho.services.caldav import _scrub_password
    msg = "POST failed -- creds were s3cret"
    assert "s3cret" not in _scrub_password(msg, "s3cret")
    assert "redacted" in _scrub_password(msg, "s3cret")


def test_s4_scrub_password_removes_basic_auth_blob():
    import base64
    from kaisho.services.caldav import _scrub_password
    password = "s3cret"
    blob = base64.b64encode(
        b":s3cret",
    ).decode("ascii")
    msg = f"AuthHeader: Basic {blob}"
    out = _scrub_password(msg, password)
    assert blob not in out


def test_s4_scrub_password_noop_on_empty_password():
    from kaisho.services.caldav import _scrub_password
    msg = "ordinary error text"
    assert _scrub_password(msg, "") == msg
