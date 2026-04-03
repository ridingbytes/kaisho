import re
from datetime import datetime

from .models import Clock

ORG_DATETIME_FMT = "%Y-%m-%d %a %H:%M"

CLOCK_CLOSED_RE = re.compile(
    r"CLOCK:\s+\[(.+?)\]--\[(.+?)\]\s+=>\s+(\d+:\d+)"
)
CLOCK_OPEN_RE = re.compile(r"CLOCK:\s+\[(.+?)\]\s*$")


def parse_datetime(s: str) -> datetime | None:
    """Parse an org datetime string."""
    try:
        return datetime.strptime(s.strip(), ORG_DATETIME_FMT)
    except ValueError:
        return None


def parse_clock_line(line: str) -> Clock | None:
    """Parse a CLOCK line into a Clock object.

    Handles both closed and open CLOCK formats.
    Returns None if line is not a valid CLOCK line.
    """
    stripped = line.strip()
    m = CLOCK_CLOSED_RE.search(stripped)
    if m:
        start = parse_datetime(m.group(1))
        end = parse_datetime(m.group(2))
        if start is None:
            return None
        return Clock(start=start, end=end, duration=m.group(3))
    m = CLOCK_OPEN_RE.search(stripped)
    if m:
        start = parse_datetime(m.group(1))
        if start is None:
            return None
        return Clock(start=start, end=None, duration=None)
    return None


def format_clock(clock: Clock) -> str:
    """Format a Clock object as an org CLOCK line."""
    start_str = clock.start.strftime(ORG_DATETIME_FMT)
    if clock.end is None:
        return f"CLOCK: [{start_str}]"
    end_str = clock.end.strftime(ORG_DATETIME_FMT)
    duration = clock.duration or _calc_duration(clock)
    return f"CLOCK: [{start_str}]--[{end_str}] =>  {duration}"


def _calc_duration(clock: Clock) -> str:
    """Calculate duration string from start/end times."""
    if clock.end is None:
        return "0:00"
    delta = clock.end - clock.start
    total_minutes = int(delta.total_seconds() / 60)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours}:{minutes:02d}"
