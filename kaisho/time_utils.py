"""Timezone-aware current-time helpers.

Uses the timezone configured in the active profile's settings.yaml.
Falls back to Europe/Berlin if nothing is configured.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from .services.settings import get_timezone, load_settings


def _configured_tz() -> str:
    from .config import get_config
    try:
        cfg = get_config()
        data = load_settings(cfg.SETTINGS_FILE)
        return get_timezone(data)
    except Exception:
        return "Europe/Berlin"


def local_now() -> datetime:
    """Return current datetime in the user's configured timezone."""
    return datetime.now(ZoneInfo(_configured_tz()))


def local_now_naive() -> datetime:
    """Return current local datetime without timezone info.

    Used for clock storage so it stays compatible with existing
    naive datetime strings already on disk.
    """
    return local_now().replace(tzinfo=None)


def local_now_iso(timespec: str = "seconds") -> str:
    """Return current datetime ISO string in the configured timezone."""
    return local_now().isoformat(timespec=timespec)
