"""CalDAV provider presets.

Pure-data registry keeping per-provider quirks (discovery
URL, auth hints, URL templating) in one place. Adding a new
preset is a one-file change.

Preset shape:
    label:          Human-readable provider name.
    url_template:   Server URL or a Python ``str.format()``
                    template using ``{host}`` / ``{user}``.
                    Empty string means the user supplies the
                    full URL.
    needs_host:     Whether the user must enter a host
                    (Nextcloud / custom self-hosted).
    needs_user_in_url:
                    Whether the URL template needs ``{user}``
                    substituted from the username field.
    hint_url:       Link to the provider's app-specific-
                    password documentation (rendered in the
                    UI as "Generate app password").
    auth_note:      One-line UI hint about the password
                    requirement.

These values inform both the Settings form (which fields
to show) and the connection step (how to assemble the URL
before handing it to caldav.DAVClient).
"""

PRESETS = {
    "icloud": {
        "label": "Apple iCloud",
        "url_template": "https://caldav.icloud.com/",
        "needs_host": False,
        "needs_user_in_url": False,
        "hint_url": (
            "https://support.apple.com/en-us/HT204397"
        ),
        "auth_note": (
            "Generate an app-specific password at "
            "appleid.apple.com -> Sign-In and Security. "
            "iCloud requires you to sign in to iCloud.com "
            "at least once after generating the password."
        ),
    },
    "fastmail": {
        "label": "Fastmail",
        "url_template": (
            "https://caldav.fastmail.com/dav/calendars/"
            "user/{user}/"
        ),
        "needs_host": False,
        "needs_user_in_url": True,
        "hint_url": (
            "https://www.fastmail.help/hc/en-us/articles/"
            "1500000278342-App-passwords"
        ),
        "auth_note": (
            "Create an app password at fastmail.com -> "
            "Settings -> Privacy & Security -> "
            "Integrations."
        ),
    },
    "nextcloud": {
        "label": "Nextcloud",
        "url_template": (
            "https://{host}/remote.php/dav/calendars/"
            "{user}/"
        ),
        "needs_host": True,
        "needs_user_in_url": True,
        "hint_url": (
            "https://docs.nextcloud.com/server/latest/"
            "user_manual/en/session_management.html"
        ),
        "auth_note": (
            "Create a device password in Nextcloud -> "
            "Personal Settings -> Security -> Devices & "
            "Sessions."
        ),
    },
    "custom": {
        "label": "Custom CalDAV",
        "url_template": "",
        "needs_host": False,
        "needs_user_in_url": False,
        "hint_url": "",
        "auth_note": (
            "Enter the full CalDAV server URL and basic-"
            "auth credentials supplied by your provider."
        ),
    },
}


def list_presets() -> list[dict]:
    """Return presets as a list with their ids included.

    Suitable for ``GET /api/caldav/presets``.
    """
    return [
        {"id": pid, **spec} for pid, spec in PRESETS.items()
    ]


def get_preset(preset_id: str) -> dict | None:
    """Return one preset spec, or None if unknown."""
    return PRESETS.get(preset_id)


def resolve_url(preset_id: str, host: str = "",
                username: str = "", url: str = "") -> str:
    """Resolve the full CalDAV URL for an account.

    For non-custom presets, the URL is templated from the
    preset; for ``custom`` the caller-supplied ``url`` is
    validated (https + non-internal host) before being
    returned. Internal-host validation blocks the SSRF
    surface where a malicious page could ask the sidecar
    to probe a corporate VPN or local services via
    ``/api/caldav/test-connection`` (see #124).

    :param preset_id: One of ``PRESETS``.
    :param host: Server host (Nextcloud / custom).
    :param username: User account (used by Fastmail /
        Nextcloud URL templates).
    :param url: Raw URL (custom preset only).
    :returns: Fully-resolved URL.
    :raises ValueError: On unknown preset / missing field
        / rejected custom URL.
    """
    spec = PRESETS.get(preset_id)
    if spec is None:
        raise ValueError(f"unknown preset: {preset_id}")

    if preset_id == "custom":
        if not url:
            raise ValueError(
                "custom preset requires a url"
            )
        _validate_custom_url(url)
        return url

    if spec["needs_host"] and not host:
        raise ValueError(
            f"{preset_id} preset requires a host"
        )
    if spec["needs_user_in_url"] and not username:
        raise ValueError(
            f"{preset_id} preset requires a username"
        )

    return spec["url_template"].format(
        host=host, user=username,
    )


def _validate_custom_url(url: str) -> None:
    """Reject a custom CalDAV URL that points at a private
    network or is non-https.

    Blocks:
      * non-https (CalDAV credentials in plain http would
        leak on any shared network)
      * RFC1918, loopback, link-local IP literals
      * hostnames that resolve to the above
      * IPv6 ULA + link-local

    Cleaner than letting the request through and hoping
    the corp firewall says no. See #124.
    """
    import ipaddress
    import socket
    from urllib.parse import urlsplit

    parts = urlsplit(url)
    if parts.scheme != "https":
        raise ValueError(
            "custom CalDAV URL must use https",
        )
    if not parts.hostname:
        raise ValueError(
            "custom CalDAV URL has no host",
        )

    try:
        addrinfo = socket.getaddrinfo(
            parts.hostname, None,
        )
    except OSError as exc:
        raise ValueError(
            f"could not resolve host: {parts.hostname}",
        ) from exc

    for entry in addrinfo:
        ip = ipaddress.ip_address(entry[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_unspecified
            or ip.is_reserved
            or ip.is_multicast
        ):
            raise ValueError(
                f"custom CalDAV URL refused: "
                f"{parts.hostname} resolves to an "
                f"internal address ({ip})",
            )
