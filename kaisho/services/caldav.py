"""CalDAV service (Phase 1: local-only).

Manages CalDAV accounts and reads events directly from the
provider. Credentials are stored split:

  * Non-secret bits (preset, url, username, label,
    enabled_calendars) live in
    ``<profile>/caldav.yaml``.
  * The password lives in the OS keychain via ``keyring``,
    falling back to an encrypted file on Linux systems
    without a D-Bus keyring backend.

The ``caldav`` library is heavy (lxml + recurring-ical-
events). All imports happen inside functions so the
sidecar's cold start is unaffected for users who never
connect a calendar.

Events are cached per ``(account_id, calendar, window)``
for ``CACHE_TTL_SECONDS`` to keep the panel snappy without
hammering iCloud.
"""
import base64
import logging
import os
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml

from ..config import get_config
from .caldav_presets import get_preset, resolve_url

log = logging.getLogger(__name__)


# -- Module constants ------------------------------------------------

KEYRING_SERVICE = "kaisho-caldav"
SETTINGS_FILENAME = "caldav.yaml"
FALLBACK_KEY_FILENAME = ".caldav.key"
FALLBACK_VAULT_FILENAME = ".caldav.vault"
CACHE_TTL_SECONDS = 60
# Hard cap a single events query to avoid runaway recurrence
# expansion against a year-long EXDATE chain.
MAX_WINDOW_DAYS = 42


class CalDavError(RuntimeError):
    """Raised on any CalDAV-side problem (auth, network,
    provider error, configuration)."""


# -- Settings file ---------------------------------------------------


def _settings_path() -> Path:
    return get_config().PROFILE_DIR / SETTINGS_FILENAME


def _load_settings() -> dict:
    path = _settings_path()
    if not path.exists():
        return {"accounts": []}
    data = yaml.safe_load(path.read_text()) or {}
    data.setdefault("accounts", [])
    return data


def _save_settings(data: dict) -> None:
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False))


# -- Password storage (keychain + encrypted-file fallback) -----------


def _keyring_set(account_id: str, password: str) -> bool:
    """Store the password in the OS keychain.

    Returns True on success, False if no keyring backend is
    available (headless Linux without D-Bus). Errors other
    than missing-backend propagate.
    """
    import keyring
    from keyring.errors import NoKeyringError
    try:
        keyring.set_password(
            KEYRING_SERVICE, account_id, password,
        )
        return True
    except NoKeyringError:
        return False


def _keyring_get(account_id: str) -> str | None:
    import keyring
    from keyring.errors import NoKeyringError
    try:
        return keyring.get_password(
            KEYRING_SERVICE, account_id,
        )
    except NoKeyringError:
        return None


def _keyring_delete(account_id: str) -> None:
    import keyring
    from keyring.errors import (
        NoKeyringError, PasswordDeleteError,
    )
    try:
        keyring.delete_password(
            KEYRING_SERVICE, account_id,
        )
    except (NoKeyringError, PasswordDeleteError):
        pass


def _fallback_key_path() -> Path:
    return get_config().PROFILE_DIR / FALLBACK_KEY_FILENAME


def _fallback_vault_path() -> Path:
    return get_config().PROFILE_DIR / FALLBACK_VAULT_FILENAME


def _load_or_create_fallback_key() -> bytes:
    """Return the machine-local fallback key, creating it
    on first use. Permissioned 0600."""
    path = _fallback_key_path()
    if path.exists():
        return base64.b64decode(path.read_bytes())
    key = secrets.token_bytes(32)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64encode(key))
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return key


def _fallback_store(account_id: str, password: str) -> None:
    """Encrypt and persist the password using the local
    fallback key. Uses AES-GCM via cryptography (already
    a transitive dep of keyring on Linux)."""
    from cryptography.hazmat.primitives.ciphers.aead import (
        AESGCM,
    )
    vault = _load_fallback_vault()
    key = _load_or_create_fallback_key()
    aes = AESGCM(key)
    nonce = secrets.token_bytes(12)
    ct = aes.encrypt(nonce, password.encode("utf-8"), None)
    vault[account_id] = {
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ct": base64.b64encode(ct).decode("ascii"),
    }
    _save_fallback_vault(vault)


def _fallback_get(account_id: str) -> str | None:
    from cryptography.hazmat.primitives.ciphers.aead import (
        AESGCM,
    )
    vault = _load_fallback_vault()
    entry = vault.get(account_id)
    if entry is None:
        return None
    key = _load_or_create_fallback_key()
    aes = AESGCM(key)
    nonce = base64.b64decode(entry["nonce"])
    ct = base64.b64decode(entry["ct"])
    return aes.decrypt(nonce, ct, None).decode("utf-8")


def _fallback_delete(account_id: str) -> None:
    vault = _load_fallback_vault()
    if vault.pop(account_id, None) is not None:
        _save_fallback_vault(vault)


def _load_fallback_vault() -> dict:
    path = _fallback_vault_path()
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text()) or {}


def _save_fallback_vault(vault: dict) -> None:
    path = _fallback_vault_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(vault, sort_keys=False))
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _set_password(account_id: str, password: str) -> str:
    """Persist a password; returns the storage strategy
    actually used (``keyring`` or ``fallback``)."""
    if _keyring_set(account_id, password):
        return "keyring"
    _fallback_store(account_id, password)
    return "fallback"


def _get_password(account_id: str) -> str | None:
    """Resolve a password from whichever store holds it."""
    pw = _keyring_get(account_id)
    if pw is not None:
        return pw
    return _fallback_get(account_id)


def _delete_password(account_id: str) -> None:
    _keyring_delete(account_id)
    _fallback_delete(account_id)


# -- Account CRUD ----------------------------------------------------


def list_accounts() -> list[dict]:
    """Return all configured accounts (without secrets).

    The returned dicts include ``id``, ``label``, ``preset``,
    ``url``, ``username``, ``enabled_calendars``,
    ``created_at``, ``storage`` (``keyring`` or
    ``fallback`` so the UI can warn).
    """
    data = _load_settings()
    return list(data["accounts"])


def get_account(account_id: str) -> dict | None:
    for acc in list_accounts():
        if acc["id"] == account_id:
            return acc
    return None


def add_account(
    preset: str,
    username: str,
    password: str,
    label: str = "",
    host: str = "",
    url: str = "",
) -> dict:
    """Persist a new account and return its public record.

    Validates the connection before saving by attempting a
    principal lookup; raises CalDavError on auth / network
    failure so the UI can surface the problem before the
    file is written.
    """
    spec = get_preset(preset)
    if spec is None:
        raise CalDavError(f"unknown preset: {preset}")
    resolved_url = resolve_url(
        preset, host=host, username=username, url=url,
    )

    test_connection(resolved_url, username, password)

    account_id = f"ac_{uuid.uuid4().hex}"
    storage = _set_password(account_id, password)
    record = {
        "id": account_id,
        "label": label or spec["label"],
        "preset": preset,
        "url": resolved_url,
        "username": username,
        "enabled_calendars": [],
        "created_at": _utc_now_iso(),
        "storage": storage,
    }

    data = _load_settings()
    data["accounts"].append(record)
    _save_settings(data)

    log.info(
        "caldav account added: id=%s preset=%s storage=%s",
        account_id, preset, storage,
    )
    return record


def remove_account(account_id: str) -> bool:
    data = _load_settings()
    before = len(data["accounts"])
    data["accounts"] = [
        a for a in data["accounts"]
        if a["id"] != account_id
    ]
    if len(data["accounts"]) == before:
        return False
    _save_settings(data)
    _delete_password(account_id)
    _invalidate_cache_for_account(account_id)
    log.info("caldav account removed: id=%s", account_id)
    return True


def set_enabled_calendars(
    account_id: str, calendars: list[str],
) -> bool:
    data = _load_settings()
    for acc in data["accounts"]:
        if acc["id"] == account_id:
            acc["enabled_calendars"] = list(calendars)
            _save_settings(data)
            _invalidate_cache_for_account(account_id)
            return True
    return False


# -- Connection / event reads ----------------------------------------


def _principal(url: str, username: str, password: str):
    """Open a CalDAV principal. Lazy-imports the library."""
    import caldav
    try:
        client = caldav.DAVClient(
            url=url, username=username, password=password,
        )
        return client.principal()
    except caldav.lib.error.AuthorizationError as exc:
        raise CalDavError(
            "Authentication failed. Check the username and "
            "app-specific password."
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise CalDavError(
            f"Could not reach CalDAV server: {exc}"
        ) from exc


def test_connection(
    url: str, username: str, password: str,
) -> dict:
    """Verify creds work; return the discovered principal
    URL + calendar count for the UI's success toast."""
    principal = _principal(url, username, password)
    calendars = principal.calendars()
    return {
        "ok": True,
        "principal_url": str(principal.url),
        "calendar_count": len(calendars),
    }


def list_calendars(account_id: str) -> list[dict]:
    """List the calendars on an account (id, name, colour
    if the server provides one)."""
    acc = get_account(account_id)
    if acc is None:
        raise CalDavError(f"unknown account: {account_id}")
    password = _get_password(account_id)
    if password is None:
        raise CalDavError(
            f"no password stored for account: {account_id}"
        )
    principal = _principal(
        acc["url"], acc["username"], password,
    )
    out = []
    for cal in principal.calendars():
        out.append({
            "id": str(cal.url),
            "name": getattr(cal, "name", None)
            or cal.url.path.split("/")[-2],
            "color": _extract_calendar_color(cal),
        })
    return out


def _extract_calendar_color(cal) -> str | None:
    """Pull the CALDAV:calendar-color server property if
    present, else None and let the UI palette assign one."""
    try:
        props = cal.get_properties(
            [("http://apple.com/ns/ical/", "calendar-color")]
        )
        return next(iter(props.values()), None) or None
    except Exception:  # noqa: BLE001
        return None


def list_events(
    frm: datetime,
    to: datetime,
    account_id: str | None = None,
    calendar: str | None = None,
    limit: int | None = None,
) -> list[dict]:
    """Return events between ``frm`` and ``to`` across all
    enabled accounts (or just one).

    Expanded recurrences are returned as separate event
    dicts. Window is hard-capped at MAX_WINDOW_DAYS to keep
    pathological recurrence rules from spinning forever.
    """
    if (to - frm).days > MAX_WINDOW_DAYS:
        raise CalDavError(
            f"window exceeds {MAX_WINDOW_DAYS} days"
        )

    accounts: list[dict]
    if account_id is not None:
        acc = get_account(account_id)
        if acc is None:
            raise CalDavError(
                f"unknown account: {account_id}"
            )
        accounts = [acc]
    else:
        accounts = list_accounts()

    out: list[dict] = []
    for acc in accounts:
        out.extend(
            _list_events_for_account(
                acc, frm, to, calendar,
            )
        )
    out.sort(key=lambda e: e["start"])
    if limit is not None:
        out = out[:limit]
    return out


def _list_events_for_account(
    acc: dict, frm: datetime, to: datetime,
    calendar: str | None,
) -> list[dict]:
    cache_key = _cache_key(
        acc["id"], calendar or "*",
        frm.isoformat(), to.isoformat(),
    )
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    password = _get_password(acc["id"])
    if password is None:
        log.warning(
            "caldav password missing for %s; skipping",
            acc["id"],
        )
        return []

    principal = _principal(
        acc["url"], acc["username"], password,
    )

    enabled = set(acc.get("enabled_calendars") or [])
    events: list[dict] = []
    for cal in principal.calendars():
        cal_url = str(cal.url)
        if calendar and cal_url != calendar:
            continue
        if enabled and cal_url not in enabled:
            continue
        events.extend(
            _fetch_events_from_calendar(
                cal, acc["id"], cal_url, frm, to,
            )
        )

    _cache_put(cache_key, events)
    return events


def _fetch_events_from_calendar(
    cal, account_id: str, calendar_id: str,
    frm: datetime, to: datetime,
) -> list[dict]:
    try:
        results = cal.search(
            start=frm, end=to, event=True, expand=True,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "caldav search failed (account=%s cal=%s): %s",
            account_id, calendar_id, exc,
        )
        return []

    out = []
    for r in results:
        for vevent in _iter_vevents(r):
            try:
                out.append(_vevent_to_dict(
                    vevent, account_id, calendar_id, r,
                ))
            except Exception as exc:  # noqa: BLE001
                log.debug(
                    "skipping malformed event: %s", exc,
                )
    return out


def _iter_vevents(result):
    """Yield each VEVENT component from a search result."""
    ical = result.icalendar_instance
    for component in ical.walk("VEVENT"):
        yield component


def _vevent_to_dict(
    vevent, account_id: str, calendar_id: str, result,
) -> dict:
    start_raw = vevent.get("DTSTART")
    end_raw = vevent.get("DTEND")
    start = _ical_dt_to_iso(start_raw)
    end = (
        _ical_dt_to_iso(end_raw)
        if end_raw is not None else start
    )
    all_day = (
        start_raw is not None
        and not _is_datetime(start_raw.dt)
    )
    uid = str(vevent.get("UID") or "")
    return {
        "id": _make_event_id(account_id, str(result.url), uid),
        "account_id": account_id,
        "calendar_id": calendar_id,
        "uid": uid,
        "title": str(vevent.get("SUMMARY") or ""),
        "start": start,
        "end": end,
        "all_day": all_day,
        "location": (
            str(vevent.get("LOCATION"))
            if vevent.get("LOCATION") else None
        ),
        "status": (
            str(vevent.get("STATUS"))
            if vevent.get("STATUS") else None
        ),
        "source": "caldav",
    }


def _ical_dt_to_iso(prop) -> str:
    """Convert an icalendar date/datetime to ISO-8601 in
    the user's local timezone (so the UI can render
    directly without TZ math)."""
    value = prop.dt
    if _is_datetime(value):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone().isoformat()
    return value.isoformat()


def _is_datetime(value) -> bool:
    return hasattr(value, "hour")


def _make_event_id(
    account_id: str, event_url: str, uid: str,
) -> str:
    """Stable, opaque event id round-trippable for
    ``get_event``."""
    raw = f"{account_id}|{event_url}|{uid}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _decode_event_id(event_id: str) -> tuple[str, str, str]:
    try:
        raw = base64.urlsafe_b64decode(event_id).decode("utf-8")
        account_id, event_url, uid = raw.split("|", 2)
    except (ValueError, UnicodeDecodeError) as exc:
        raise CalDavError(
            f"invalid event id: {event_id}"
        ) from exc
    return account_id, event_url, uid


def get_event(event_id: str) -> dict:
    """Fetch one event by its opaque id (returned by
    ``list_events``). Returns the full record incl.
    description + organizer."""
    account_id, event_url, _uid = _decode_event_id(event_id)
    acc = get_account(account_id)
    if acc is None:
        raise CalDavError(
            f"unknown account: {account_id}"
        )
    password = _get_password(account_id)
    if password is None:
        raise CalDavError(
            f"no password stored for: {account_id}"
        )

    import caldav
    client = caldav.DAVClient(
        url=acc["url"],
        username=acc["username"],
        password=password,
    )
    try:
        ev = client.calendar(url=event_url).event_by_url(
            event_url,
        )
    except Exception as exc:  # noqa: BLE001
        raise CalDavError(
            f"could not fetch event: {exc}"
        ) from exc

    vevent = next(iter(
        ev.icalendar_instance.walk("VEVENT")
    ), None)
    if vevent is None:
        raise CalDavError("event has no VEVENT")

    out = _vevent_to_dict(
        vevent, account_id, str(ev.url), ev,
    )
    out["description"] = (
        str(vevent.get("DESCRIPTION"))
        if vevent.get("DESCRIPTION") else None
    )
    out["organizer"] = (
        str(vevent.get("ORGANIZER"))
        if vevent.get("ORGANIZER") else None
    )
    return out


def refresh_account(account_id: str) -> int:
    """Invalidate cache for one account. Returns the number
    of cache entries dropped, for the UI toast."""
    return _invalidate_cache_for_account(account_id)


# -- Cache -----------------------------------------------------------

_cache: dict[str, tuple[float, list[dict]]] = {}
_cache_lock = threading.Lock()


def _cache_key(*parts: str) -> str:
    return "|".join(parts)


def _cache_get(key: str) -> list[dict] | None:
    with _cache_lock:
        entry = _cache.get(key)
    if entry is None:
        return None
    ts, value = entry
    if time.time() - ts > CACHE_TTL_SECONDS:
        return None
    return value


def _cache_put(key: str, value: list[dict]) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), value)


def _invalidate_cache_for_account(account_id: str) -> int:
    with _cache_lock:
        keys = [
            k for k in _cache
            if k.startswith(f"{account_id}|")
        ]
        for k in keys:
            _cache.pop(k, None)
    return len(keys)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(
        timespec="seconds",
    )


# -- Utility for callers --------------------------------------------


def has_any_account() -> bool:
    return len(list_accounts()) > 0
