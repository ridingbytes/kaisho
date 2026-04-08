"""Current-time helpers.

Uses system local time. No timezone configuration needed
for a single-user, self-hosted app.
"""
from datetime import datetime


def local_now() -> datetime:
    """Return current local datetime."""
    return datetime.now()


def local_now_naive() -> datetime:
    """Return current local datetime (naive).

    Alias for local_now() since we always use naive
    datetimes for storage compatibility.
    """
    return datetime.now()


def local_now_iso(timespec: str = "seconds") -> str:
    """Return current datetime as ISO string."""
    return datetime.now().isoformat(timespec=timespec)
