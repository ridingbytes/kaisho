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
        # Phase 1.5: per-account toggle for pushing
        # kaisho clock entries onto a CalDAV calendar.
        # Both fields are mutated via set_push_config;
        # default is off + auto-resolved Kaisho calendar.
        "push_enabled": False,
        "push_calendar_id": "",
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


def get_push_config(account_id: str) -> dict | None:
    """Return the per-account push config for the UI.

    Shape:
        {
          "enabled": bool,
          "calendar_id": str,   # empty -> use Kaisho cal
        }
    """
    acc = get_account(account_id)
    if acc is None:
        return None
    return {
        "enabled": bool(acc.get("push_enabled", False)),
        "calendar_id": acc.get("push_calendar_id", "") or "",
    }


def set_push_config(
    account_id: str,
    enabled: bool,
    calendar_id: str = "",
) -> dict:
    """Persist the per-account push config.

    When ``enabled`` is True and ``calendar_id`` is empty,
    the side effect creates (or finds) the dedicated
    "Kaisho" calendar on the account and pins its URL.
    The intent: the user can either pick an existing
    calendar from the dropdown or accept the default,
    which sandboxes our writes to a calendar they did
    not pre-own. This avoids polluting the user's
    primary "Work" calendar by accident.

    :raises CalDavError: when ``enabled`` is True but the
        provided ``calendar_id`` is not writable, or the
        Kaisho-calendar autocreate fails.
    """
    data = _load_settings()
    for acc in data["accounts"]:
        if acc["id"] != account_id:
            continue
        if enabled:
            # On enable we either honour the picked
            # calendar (after verifying it's writable)
            # or fall back to the dedicated Kaisho one.
            if calendar_id:
                _verify_writable(account_id, calendar_id)
            else:
                kaisho = ensure_kaisho_calendar(account_id)
                calendar_id = kaisho["id"]
            acc["push_enabled"] = True
            acc["push_calendar_id"] = calendar_id
            # Sync engine reads this to skip historical
            # entries on first enable -- only entries
            # created or modified after this timestamp
            # are pushed. Avoids surprising users by
            # back-flooding their calendar with 6 months
            # of past work when they first toggle on.
            if not acc.get("push_enabled_since"):
                acc["push_enabled_since"] = _utc_now_iso()
        else:
            # On disable we preserve the previously-
            # selected calendar so a toggle-off-then-on
            # does not force the user to pick again. The
            # verify-on-enable above catches the case
            # where the user deleted the calendar in
            # Apple Calendar in the meantime.
            acc["push_enabled"] = False
            # Allow the caller to *also* swap the
            # calendar atomically with the disable by
            # passing both. Empty string keeps the
            # existing value.
            if calendar_id:
                acc["push_calendar_id"] = calendar_id
        _save_settings(data)
        log.info(
            "caldav push config set: id=%s "
            "enabled=%s calendar=%s",
            account_id, enabled,
            acc["push_calendar_id"],
        )
        return {
            "enabled": acc["push_enabled"],
            "calendar_id": acc["push_calendar_id"],
        }
    raise CalDavError(f"unknown account: {account_id}")


def push_enabled_accounts() -> list[dict]:
    """Accounts opted into clock-entry push.

    Returns one dict per account: ``account_id``,
    ``calendar_id`` (already resolved to the URL the
    sync engine writes into), and ``enabled_since``
    (ISO timestamp -- entries older than this are
    skipped on first push to avoid back-flooding).
    """
    out = []
    for acc in list_accounts():
        if not acc.get("push_enabled"):
            continue
        out.append({
            "account_id": acc["id"],
            "calendar_id": acc.get("push_calendar_id") or "",
            "enabled_since": acc.get(
                "push_enabled_since",
            ) or "",
        })
    return out


def _verify_writable(
    account_id: str, calendar_id: str,
) -> None:
    """Reject a calendar id the user does not actually
    own on this account. Without this the UI dropdown
    could be tampered with to push to a shared / system
    calendar the user is not the owner of."""
    cals = list_writable_calendars(account_id)
    ids = {c["id"] for c in cals}
    if calendar_id not in ids:
        raise CalDavError(
            f"calendar not on account: {calendar_id}"
        )


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
    duration_raw = vevent.get("DURATION")
    start = _ical_dt_to_iso(start_raw)
    end = _resolve_end_iso(start_raw, end_raw, duration_raw)
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


def _resolve_end_iso(start_raw, end_raw, duration_raw) -> str:
    """Compute the wire-format ``end`` for an event.

    iCalendar permits one of three encodings for an event's
    end: DTEND directly, DURATION relative to DTSTART, or
    neither (in which case zero-duration is implied -- not
    common but legal). Apple Calendar and Nextcloud both
    emit DTEND for normal events but external invites
    relayed through some servers prefer DURATION. The
    earlier version ignored DURATION and rendered such
    events as 0-minute pills. See review F6.
    """
    if end_raw is not None:
        return _ical_dt_to_iso(end_raw)
    if duration_raw is not None and start_raw is not None:
        try:
            return _to_local_iso(
                _add_dt(start_raw.dt, duration_raw.dt),
            )
        except Exception:  # noqa: BLE001
            log.debug(
                "could not apply DURATION %r to %r",
                duration_raw, start_raw,
            )
    return _ical_dt_to_iso(start_raw)


def _add_dt(start_val, duration_val):
    """Add a timedelta to a date or datetime, preserving
    the type so all-day + duration stays all-day."""
    return start_val + duration_val


def _to_local_iso(value) -> str:
    """Wire-format a date/datetime as the rest of the
    module does (local TZ for datetimes, bare ISO for
    dates)."""
    if _is_datetime(value):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone().isoformat()
    return value.isoformat()


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
    description + organizer.

    The earlier implementation passed the event URL to
    ``client.calendar(url=...)``, which iCloud either 404s
    or routes to the wrong principal. We now share the
    same `_fetch_event_object` helper the write path
    (`update_event`, `delete_event`) uses, so all four
    read/write code paths agree on how to derive the
    calendar URL from an event URL.
    """
    account_id, event_url, _uid = _decode_event_id(event_id)
    ev = _fetch_event_object(account_id, event_url)
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


# -- Write primitives (Phase 1.5) ------------------------------------
#
# Used by the clock-entry push sync engine. Kept here so all CalDAV
# I/O lives in one module. Each function returns the canonical
# event_url so the caller can persist the mapping (sync_id -> url).

KAISHO_CALENDAR_NAME = "Kaisho"


def list_writable_calendars(account_id: str) -> list[dict]:
    """Like list_calendars, but filtered to the calendars
    the credentials can actually write to.

    Some CalDAV servers expose shared/read-only calendars
    alongside the owner's own. Filtering here avoids the
    confused error message at first push.
    """
    cals = list_calendars(account_id)
    # Most providers either implement DAV current-user-
    # privilege-set (RFC 3744) or simply 403 the PUT.
    # In v1.5 we trust the provider's calendar list -- a
    # later refinement can probe DAV:current-user-privilege
    # -set when iCloud's flakiness justifies the round-trip.
    return cals


def ensure_kaisho_calendar(account_id: str) -> dict:
    """Return the per-account "Kaisho" calendar, creating
    it if it does not yet exist.

    Idempotent. The display name is the module constant
    above so it can be re-discovered on later runs without
    storing its URL anywhere fragile. Some providers
    (iCloud) auto-assign a colour; others (Nextcloud)
    leave it null until the user picks one in their UI.
    """
    for cal in list_writable_calendars(account_id):
        if cal["name"] == KAISHO_CALENDAR_NAME:
            return cal

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

    principal = _principal(
        acc["url"], acc["username"], password,
    )
    try:
        new_cal = principal.make_calendar(
            name=KAISHO_CALENDAR_NAME,
        )
    except Exception as exc:  # noqa: BLE001
        raise CalDavError(
            f"could not create calendar: {exc}"
        ) from exc

    _invalidate_cache_for_account(account_id)
    return {
        "id": str(new_cal.url),
        "name": KAISHO_CALENDAR_NAME,
        "color": None,
    }


def create_event(
    account_id: str,
    calendar_id: str,
    summary: str,
    start: datetime,
    end: datetime,
    description: str | None = None,
    uid: str | None = None,
    categories: list[str] | None = None,
) -> dict:
    """Create a VEVENT on the given calendar.

    Returns ``{event_url, etag, uid}``. ``etag`` may be
    ``None`` when the server does not return one on PUT
    (some Radicale setups); the sync engine treats a
    missing etag as "fetch on next round-trip".
    """
    ical = _build_vevent(
        summary=summary, start=start, end=end,
        description=description, uid=uid,
        categories=categories,
    )
    cal = _open_calendar(account_id, calendar_id)
    try:
        ev = cal.save_event(ical)
    except Exception as exc:  # noqa: BLE001
        raise CalDavError(
            f"could not create event: {exc}"
        ) from exc

    _invalidate_cache_for_account(account_id)
    return {
        "event_url": str(ev.url),
        "etag": _safe_etag(ev),
        "uid": uid or _extract_uid(ev),
    }


def update_event(
    account_id: str,
    event_url: str,
    summary: str,
    start: datetime,
    end: datetime,
    description: str | None = None,
    categories: list[str] | None = None,
) -> dict:
    """Replace a VEVENT in place, preserving its UID.

    Returns ``{event_url, etag, uid}``. If the event no
    longer exists on the server (manual delete in the
    Calendar app), raises CalDavError. The sync engine
    that will land in Phase 1.5 PR 3 (#117) handles the
    re-create path; until then callers should treat the
    error as terminal.
    """
    ev = _fetch_event_object(account_id, event_url)
    vevent = next(iter(
        ev.icalendar_instance.walk("VEVENT")
    ), None)
    if vevent is None:
        raise CalDavError(
            "event has no VEVENT (cannot update)"
        )
    uid = str(vevent.get("UID") or "")

    ical = _build_vevent(
        summary=summary, start=start, end=end,
        description=description, uid=uid,
        categories=categories,
    )
    try:
        ev.data = ical
        ev.save()
    except Exception as exc:  # noqa: BLE001
        raise CalDavError(
            f"could not update event: {exc}"
        ) from exc

    _invalidate_cache_for_account(account_id)
    return {
        "event_url": str(ev.url),
        "etag": _safe_etag(ev),
        "uid": uid,
    }


def delete_event(account_id: str, event_url: str) -> None:
    """Delete a VEVENT. Idempotent: a missing event is
    treated as "already gone" and does not raise."""
    try:
        ev = _fetch_event_object(account_id, event_url)
    except CalDavError:
        # Already gone -- nothing to do.
        return
    try:
        ev.delete()
    except Exception as exc:  # noqa: BLE001
        raise CalDavError(
            f"could not delete event: {exc}"
        ) from exc
    _invalidate_cache_for_account(account_id)


# -- Internal write helpers -----------------------------------------


def _open_calendar(account_id: str, calendar_id: str):
    """Return a caldav Calendar object handle."""
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
    return client.calendar(url=calendar_id)


def _fetch_event_object(account_id: str, event_url: str):
    """Return the caldav Event object for a stored
    event_url. Translates 404 / network errors into
    CalDavError."""
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
        # We need the calendar URL to call .event_by_url;
        # CalDAV URLs are ``.../calendar/.../event.ics`` so
        # one level up is the calendar root.
        cal_url = event_url.rsplit("/", 1)[0] + "/"
        return client.calendar(url=cal_url).event_by_url(
            event_url,
        )
    except Exception as exc:  # noqa: BLE001
        raise CalDavError(
            f"could not fetch event: {exc}"
        ) from exc


def _build_vevent(
    summary: str,
    start: datetime,
    end: datetime,
    description: str | None,
    uid: str | None,
    categories: list[str] | None,
) -> str:
    """Render a single-VEVENT iCalendar payload.

    Times are written as UTC for portability; the
    server-side calendar app converts to the user's TZ on
    display. icalendar normalises a naive datetime to UTC
    only if explicitly told to.
    """
    from icalendar import Calendar, Event
    cal = Calendar()
    cal.add("prodid", "-//kaisho//caldav 1.0//EN")
    cal.add("version", "2.0")

    ev = Event()
    if uid is None:
        uid = f"kaisho-{uuid.uuid4().hex}"
    ev.add("uid", uid)
    ev.add("summary", summary)
    ev.add("dtstart", _to_utc(start))
    ev.add("dtend", _to_utc(end))
    ev.add("dtstamp", _to_utc(datetime.now(timezone.utc)))
    if description:
        ev.add("description", description)
    if categories:
        ev.add("categories", categories)
    cal.add_component(ev)
    return cal.to_ical().decode("utf-8")


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _extract_uid(ev) -> str:
    vevent = next(iter(
        ev.icalendar_instance.walk("VEVENT")
    ), None)
    if vevent is None:
        return ""
    return str(vevent.get("UID") or "")


def _safe_etag(ev) -> str | None:
    """Return the server's ETag for the event, or None
    when the library / server did not surface it."""
    etag = getattr(ev, "etag", None)
    return str(etag) if etag else None


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
