import re
from datetime import date, datetime, timedelta

from ..time_utils import local_now_naive as local_now
from pathlib import Path

from ..org.models import Clock, Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

# Heading title format: [CUSTOMER]: description
ENTRY_RE = re.compile(r"^\[([^\]]+)\]:\s*(.*)")
DURATION_SIMPLE_RE = re.compile(
    r"^(\d+(?:\.\d+)?)\s*(h|hours?|m|min|mins|minutes?)$"
)
DURATION_COMPOUND_RE = re.compile(
    r"^(\d+)\s*h\s*(\d+)\s*(?:m|min|mins|minutes?)?$"
)
CLOCK_KEYWORDS: set[str] = set()


def _parse_entry_title(title: str) -> tuple[str, str]:
    """Parse '[CUSTOMER]: description' into (customer, description)."""
    m = ENTRY_RE.match(title.strip())
    if m:
        return m.group(1), m.group(2).strip()
    return "", title.strip()


def _entry_title(customer: str, description: str) -> str:
    """Format a heading title as '[customer]: description'."""
    return f"[{customer}]: {description}"


def _parse_duration(duration_str: str) -> int | None:
    """Parse duration string to minutes.

    Accepts: '2h', '30min', '90m', '1.5h', '1h30m', '1h 30min'.
    """
    s = duration_str.strip().lower()
    cm = DURATION_COMPOUND_RE.match(s)
    if cm:
        return int(cm.group(1)) * 60 + int(cm.group(2))
    sm = DURATION_SIMPLE_RE.match(s)
    if not sm:
        return None
    value = float(sm.group(1))
    unit = sm.group(2)
    if unit.startswith("h"):
        return int(value * 60)
    return int(value)


def _clock_to_entry(
    clock: Clock,
    customer: str,
    description: str,
    task_id: str | None = None,
    booked: bool = False,
    notes: str | None = None,
    contract: str | None = None,
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
        "task_id": task_id,
        "booked": booked,
        "notes": notes or "",
        "contract": contract or None,
    }


def _heading_notes(heading: Heading) -> str | None:
    """Extract body text from a clock heading as notes."""
    text = "\n".join(heading.body).strip()
    return text or None


def _collect_clock_entries(org_file: OrgFile) -> list[dict]:
    """Collect all clock entries from the flat org file."""
    entries = []
    for h1 in org_file.headings:
        customer, desc = _parse_entry_title(h1.title)
        task_id = h1.properties.get("TASK_ID") or None
        booked = h1.properties.get("BOOKED", "").lower() == "true"
        notes = _heading_notes(h1)
        contract = h1.properties.get("CONTRACT") or None
        for clock in h1.logbook:
            entries.append(
                _clock_to_entry(
                    clock, customer, desc,
                    task_id, booked, notes, contract,
                )
            )
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
        last = d.replace(
            month=d.month + 1, day=1
        ) - timedelta(days=1)
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
    task_id: str | None = None,
    contract: str | None = None,
) -> list[dict]:
    """List clock entries filtered by period, customer, or task."""
    if not clocks_file.exists():
        return []
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    all_entries = _collect_clock_entries(org_file)
    result = []
    for entry in all_entries:
        if customer and entry["customer"] != customer:
            continue
        if task_id is not None and entry["task_id"] != task_id:
            continue
        if contract is not None and entry.get("contract") != contract:
            continue
        if task_id is None and not _in_period(
            entry, period, from_date, to_date
        ):
            continue
        result.append(entry)
    return result


def get_active_timer(clocks_file: Path) -> dict | None:
    """Return the open CLOCK entry if any."""
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    for h1 in org_file.headings:
        customer, desc = _parse_entry_title(h1.title)
        task_id = h1.properties.get("TASK_ID") or None
        booked = h1.properties.get("BOOKED", "").lower() == "true"
        notes = _heading_notes(h1)
        contract = h1.properties.get("CONTRACT") or None
        for clock in h1.logbook:
            if clock.end is None:
                return _clock_to_entry(
                    clock, customer, desc,
                    task_id, booked, notes, contract,
                )
    return None


def quick_book(
    clocks_file: Path,
    duration_str: str,
    customer: str,
    description: str,
    task_id: str | None = None,
    contract: str | None = None,
    target_date: date | None = None,
) -> dict:
    """Book time on a specific date (or today)."""
    minutes = _parse_duration(duration_str)
    if minutes is None:
        raise ValueError(f"Invalid duration: {duration_str}")

    if target_date:
        # Book at noon on the target date
        start = datetime(
            target_date.year, target_date.month,
            target_date.day, 12, 0, 0,
        )
        end = start + timedelta(minutes=minutes)
    else:
        end = local_now().replace(second=0, microsecond=0)
        start = end - timedelta(minutes=minutes)
        if start.date() < end.date():
            start = end.replace(hour=0, minute=0)
    clock = Clock(start=start, end=end)

    _append_clock_entry(
        clocks_file, customer, description, clock, task_id, contract
    )
    return _clock_to_entry(
        clock, customer, description, task_id, contract=contract
    )


def start_timer(
    clocks_file: Path,
    customer: str,
    description: str,
    task_id: str | None = None,
    contract: str | None = None,
) -> dict:
    """Start an open CLOCK entry."""
    active = get_active_timer(clocks_file)
    if active is not None:
        raise ValueError(
            f"Timer already running for {active['customer']}: "
            f"{active['description']}"
        )

    start = local_now().replace(second=0, microsecond=0)
    clock = Clock(start=start, end=None)
    _append_clock_entry(
        clocks_file, customer, description, clock, task_id, contract
    )
    return _clock_to_entry(
        clock, customer, description, task_id, contract=contract
    )


def stop_timer(clocks_file: Path) -> dict:
    """Close the open CLOCK entry."""
    if not clocks_file.exists():
        raise ValueError("No active timer found")

    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    found_clock = None
    found_heading = None

    for h1 in org_file.headings:
        for clock in h1.logbook:
            if clock.end is None:
                found_clock = clock
                found_heading = h1
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

    customer, desc = _parse_entry_title(found_heading.title)
    return _clock_to_entry(found_clock, customer, desc)


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
        for clock in h1.logbook:
            if clock.start == target:
                return clock, h1
    return None


def update_clock_entry(
    clocks_file: Path,
    start_iso: str,
    customer: str | None = None,
    description: str | None = None,
    hours: float | None = None,
    new_date: date | None = None,
    start_time: str | None = None,
    task_id: str | None = None,
    booked: bool | None = None,
    notes: str | None = None,
    contract: str | None = None,
) -> dict | None:
    """Update customer, description, hours, date, task, booked, or notes."""
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    result = _find_clock_by_start(org_file, start_iso)
    if result is None:
        return None
    clock, heading = result
    current_customer, current_desc = _parse_entry_title(heading.title)
    if customer is not None:
        current_customer = customer
    if description is not None:
        current_desc = description
    if customer is not None or description is not None:
        heading.title = _entry_title(current_customer, current_desc)
        heading.dirty = True
    if new_date is not None:
        delta = timedelta(
            days=(new_date - clock.start.date()).days
        )
        clock.start = clock.start + delta
        if clock.end is not None:
            clock.end = clock.end + delta
        heading.dirty = True
    if start_time is not None:
        h, m = (int(x) for x in start_time.split(":"))
        duration = (
            (clock.end - clock.start)
            if clock.end
            else timedelta()
        )
        clock.start = clock.start.replace(
            hour=h, minute=m, second=0
        )
        if clock.end is not None:
            clock.end = clock.start + duration
        heading.dirty = True
    if hours is not None:
        minutes = int(hours * 60)
        new_end = clock.start + timedelta(minutes=minutes)
        h = minutes // 60
        m = minutes % 60
        clock.end = new_end
        clock.duration = f"{h}:{m:02d}"
        heading.dirty = True
    if task_id is not None:
        if task_id == "":
            heading.properties.pop("TASK_ID", None)
        else:
            heading.properties["TASK_ID"] = task_id
        heading.dirty = True
    if booked is not None:
        if booked:
            heading.properties["BOOKED"] = "true"
        else:
            heading.properties.pop("BOOKED", None)
        heading.dirty = True
    if notes is not None:
        heading.body = notes.splitlines() if notes.strip() else []
        heading.dirty = True
    if contract is not None:
        if contract:
            heading.properties["CONTRACT"] = contract
        else:
            heading.properties.pop("CONTRACT", None)
        heading.dirty = True
    current_task_id = heading.properties.get("TASK_ID") or None
    current_booked = (
        heading.properties.get("BOOKED", "").lower() == "true"
    )
    current_notes = _heading_notes(heading)
    current_contract = heading.properties.get("CONTRACT") or None
    write_org_file(clocks_file, org_file)
    return _clock_to_entry(
        clock, current_customer, current_desc,
        current_task_id, current_booked, current_notes,
        current_contract,
    )


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
    task_id: str | None = None,
    contract: str | None = None,
) -> None:
    """Append a clock entry to clocks.org as a flat heading."""
    if not clocks_file.exists():
        clocks_file.parent.mkdir(parents=True, exist_ok=True)
        org_file = OrgFile()
    else:
        org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)

    title = _entry_title(customer, description)
    entry_heading = _find_or_create_heading(
        org_file.headings, title, level=1, task_id=task_id
    )
    if task_id:
        entry_heading.properties["TASK_ID"] = task_id
    if contract:
        entry_heading.properties["CONTRACT"] = contract
    entry_heading.logbook.append(clock)
    entry_heading.dirty = True

    write_org_file(clocks_file, org_file)


def _find_or_create_heading(
    headings: list[Heading],
    title: str,
    level: int,
    task_id: str | None = None,
) -> Heading:
    """Find heading by title and task_id, or create a new one."""
    for h in headings:
        title_match = h.title.strip().lower() == title.strip().lower()
        heading_task = h.properties.get("TASK_ID") or None
        if title_match and heading_task == task_id:
            return h
    new_h = Heading(
        level=level, keyword=None, title=title, dirty=True
    )
    headings.append(new_h)
    return new_h
