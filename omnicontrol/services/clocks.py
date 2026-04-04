import re
from datetime import date, datetime, timedelta
from pathlib import Path

from ..org.models import Clock, Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

DURATION_RE = re.compile(
    r"^(\d+(?:\.\d+)?)\s*(h|hour|hours|min|mins|minutes?)$"
)
CLOCK_KEYWORDS: set[str] = set()


def _parse_duration(duration_str: str) -> int | None:
    """Parse duration string to minutes. e.g. '2h', '30min'."""
    m = DURATION_RE.match(duration_str.strip().lower())
    if not m:
        return None
    value = float(m.group(1))
    unit = m.group(2)
    if unit.startswith("h"):
        return int(value * 60)
    return int(value)


def _clock_to_entry(
    clock: Clock, customer: str, description: str
) -> dict:
    """Convert a Clock to a clock entry dict."""
    duration_minutes = None
    if clock.end is not None:
        delta = clock.end - clock.start
        duration_minutes = int(delta.total_seconds() / 60)
    return {
        "customer": customer,
        "description": description,
        "start": clock.start.isoformat(),
        "end": clock.end.isoformat() if clock.end else None,
        "duration_minutes": duration_minutes,
    }


def _collect_clock_entries(org_file: OrgFile) -> list[dict]:
    """Collect all clock entries from the org file."""
    entries = []
    for h1 in org_file.headings:
        customer = h1.title.strip()
        for h2 in h1.children:
            desc = h2.title.strip()
            for clock in h2.logbook:
                entries.append(_clock_to_entry(clock, customer, desc))
            # Also check direct clocks on h1
        for clock in h1.logbook:
            entries.append(_clock_to_entry(clock, customer, ""))
    return entries


def _entry_date(entry: dict) -> date | None:
    """Extract date from an entry's start timestamp."""
    start = entry.get("start")
    if not start:
        return None
    try:
        return datetime.fromisoformat(start).date()
    except ValueError:
        return None


def _week_range(d: date) -> tuple[date, date]:
    """Return Monday and Sunday of the week containing d."""
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _month_range(d: date) -> tuple[date, date]:
    """Return first and last day of the month containing d."""
    first = d.replace(day=1)
    if d.month == 12:
        last = d.replace(day=31)
    else:
        last = d.replace(month=d.month + 1, day=1) - timedelta(days=1)
    return first, last


def _in_period(
    entry: dict,
    period: str,
    from_date: date | None,
    to_date: date | None,
) -> bool:
    """Check if entry falls within the specified period."""
    entry_date = _entry_date(entry)
    if entry_date is None:
        return False
    today = date.today()

    if from_date and to_date:
        return from_date <= entry_date <= to_date

    if period == "today":
        return entry_date == today
    if period == "week":
        start, end = _week_range(today)
        return start <= entry_date <= end
    if period == "month":
        start, end = _month_range(today)
        return start <= entry_date <= end
    return True


def list_entries(
    clocks_file: Path,
    period: str = "today",
    customer: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    """List clock entries filtered by period and customer."""
    if not clocks_file.exists():
        return []
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    all_entries = _collect_clock_entries(org_file)
    result = []
    for entry in all_entries:
        if customer and entry["customer"] != customer:
            continue
        if not _in_period(entry, period, from_date, to_date):
            continue
        result.append(entry)
    return result


def get_active_timer(clocks_file: Path) -> dict | None:
    """Return the open CLOCK entry if any."""
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    for h1 in org_file.headings:
        customer = h1.title.strip()
        for h2 in h1.children:
            desc = h2.title.strip()
            for clock in h2.logbook:
                if clock.end is None:
                    return _clock_to_entry(clock, customer, desc)
        for clock in h1.logbook:
            if clock.end is None:
                return _clock_to_entry(clock, customer, "")
    return None


def quick_book(
    clocks_file: Path,
    duration_str: str,
    customer: str,
    description: str,
) -> dict:
    """Book time: end=now, start=now-duration."""
    minutes = _parse_duration(duration_str)
    if minutes is None:
        raise ValueError(f"Invalid duration: {duration_str}")

    end = datetime.now().replace(second=0, microsecond=0)
    start = end - timedelta(minutes=minutes)
    clock = Clock(start=start, end=end)

    _append_clock_entry(clocks_file, customer, description, clock)
    return _clock_to_entry(clock, customer, description)


def start_timer(
    clocks_file: Path,
    customer: str,
    description: str,
) -> dict:
    """Start an open CLOCK entry."""
    active = get_active_timer(clocks_file)
    if active is not None:
        raise ValueError(
            f"Timer already running for {active['customer']}: "
            f"{active['description']}"
        )

    start = datetime.now().replace(second=0, microsecond=0)
    clock = Clock(start=start, end=None)
    _append_clock_entry(clocks_file, customer, description, clock)
    return _clock_to_entry(clock, customer, description)


def stop_timer(clocks_file: Path) -> dict:
    """Close the open CLOCK entry."""
    if not clocks_file.exists():
        raise ValueError("No active timer found")

    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    found_clock = None
    found_heading = None
    found_customer = None

    for h1 in org_file.headings:
        customer = h1.title.strip()
        for h2 in h1.children:
            for clock in h2.logbook:
                if clock.end is None:
                    found_clock = clock
                    found_heading = h2
                    found_customer = customer
                    break
            if found_clock:
                break
        if not found_clock:
            for clock in h1.logbook:
                if clock.end is None:
                    found_clock = clock
                    found_heading = h1
                    found_customer = customer
                    break
        if found_clock:
            break

    if found_clock is None or found_heading is None:
        raise ValueError("No active timer found")

    end = datetime.now().replace(second=0, microsecond=0)
    delta = end - found_clock.start
    total_minutes = int(delta.total_seconds() / 60)
    hours = total_minutes // 60
    mins = total_minutes % 60
    found_clock.end = end
    found_clock.duration = f"{hours}:{mins:02d}"
    found_heading.dirty = True

    write_org_file(clocks_file, org_file)

    desc = found_heading.title.strip()
    return _clock_to_entry(found_clock, found_customer or desc, desc)


def get_summary(
    clocks_file: Path,
    period: str = "month",
) -> list[dict]:
    """Return hours per customer for the given period."""
    entries = list_entries(clocks_file, period=period)
    totals: dict[str, int] = {}
    for entry in entries:
        customer = entry["customer"]
        minutes = entry.get("duration_minutes") or 0
        totals[customer] = totals.get(customer, 0) + minutes

    return [
        {
            "customer": customer,
            "minutes": minutes,
            "hours": round(minutes / 60, 1),
        }
        for customer, minutes in sorted(totals.items())
    ]


def _find_clock_by_start(
    org_file: OrgFile, start_iso: str
) -> tuple[Clock, Heading] | None:
    """Find a clock entry by its start timestamp. Returns (clock, heading)."""
    try:
        target = datetime.fromisoformat(start_iso)
    except ValueError:
        return None
    for h1 in org_file.headings:
        for h2 in h1.children:
            for clock in h2.logbook:
                if clock.start == target:
                    return clock, h2
        for clock in h1.logbook:
            if clock.start == target:
                return clock, h1
    return None


def update_clock_entry(
    clocks_file: Path,
    start_iso: str,
    description: str | None = None,
    hours: float | None = None,
) -> dict | None:
    """Update description and/or hours of a clock entry by start time."""
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    result = _find_clock_by_start(org_file, start_iso)
    if result is None:
        return None
    clock, heading = result
    if description is not None:
        heading.title = description
        heading.dirty = True
    if hours is not None:
        minutes = int(hours * 60)
        new_end = clock.start + timedelta(minutes=minutes)
        h = minutes // 60
        m = minutes % 60
        clock.end = new_end
        clock.duration = f"{h}:{m:02d}"
        heading.dirty = True
    write_org_file(clocks_file, org_file)
    customer = ""
    for h1 in org_file.headings:
        for h2 in h1.children:
            if h2 is heading:
                customer = h1.title.strip()
    return _clock_to_entry(clock, customer, heading.title.strip())


def delete_clock_entry(
    clocks_file: Path,
    start_iso: str,
) -> bool:
    """Delete a clock entry by its start timestamp."""
    if not clocks_file.exists():
        return False
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    try:
        target = datetime.fromisoformat(start_iso)
    except ValueError:
        return False
    for h1 in org_file.headings:
        for h2 in h1.children:
            for clock in list(h2.logbook):
                if clock.start == target:
                    h2.logbook.remove(clock)
                    h2.dirty = True
                    h1.dirty = True
                    write_org_file(clocks_file, org_file)
                    return True
        for clock in list(h1.logbook):
            if clock.start == target:
                h1.logbook.remove(clock)
                h1.dirty = True
                write_org_file(clocks_file, org_file)
                return True
    return False


def _append_clock_entry(
    clocks_file: Path,
    customer: str,
    description: str,
    clock: Clock,
) -> None:
    """Append a clock entry to clocks.org."""
    if not clocks_file.exists():
        clocks_file.parent.mkdir(parents=True, exist_ok=True)
        org_file = OrgFile()
    else:
        org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)

    customer_heading = _find_or_create_heading(
        org_file.headings, customer, level=1
    )
    task_heading = _find_or_create_heading(
        customer_heading.children, description, level=2
    )
    task_heading.logbook.append(clock)
    task_heading.dirty = True
    customer_heading.dirty = True

    write_org_file(clocks_file, org_file)


def _find_or_create_heading(
    headings: list[Heading], title: str, level: int
) -> Heading:
    """Find heading by title or create a new one."""
    for h in headings:
        if h.title.strip().lower() == title.strip().lower():
            return h
    new_h = Heading(level=level, keyword=None, title=title, dirty=True)
    headings.append(new_h)
    return new_h
