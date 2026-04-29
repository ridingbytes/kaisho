"""Clock entry service.

Reads and writes time-tracking entries from an org-mode
``clocks.org`` file. Each entry is an org heading with a
single CLOCK logbook line::

    * [2026-04-17 Thu] [Acme]: Fix login bug
      :PROPERTIES:
      :SYNC_ID: 644e97a2-77a2-4ff8-b7d7-1c766ef3f2b8
      :UPDATED_AT: 2026-04-17T09:30:00.123456
      :TASK_ID: T-42
      :CONTRACT: Maintenance 2026
      :END:
      :LOGBOOK:
      CLOCK: [2026-04-17 Thu 09:00]--[2026-04-17 Thu 10:30] =>  1:30
      :END:

Architectural notes (following the senaite.core API
pattern):

- Functions operate on a single entry where possible.
  Callers use ``map()`` for batch processing.
- Public functions (``list_entries``, ``start_timer``,
  ``quick_book``, etc.) are the stable API used by
  backends and routers.
- Helper functions are module-level (no underscore
  prefix) and documented — they're useful context for
  anyone reading this file.
"""
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

from ..time_utils import local_now_naive as local_now

from ..org.models import Clock, Heading, OrgFile
from ..org.parser import parse_org_file
from ..org.writer import write_org_file

# -- Constants ------------------------------------------------

# Heading title format: [DATE] [CUSTOMER]: description
# Also supports legacy format: [CUSTOMER]: description
ENTRY_RE = re.compile(
    r"^(?:\[\d{4}-\d{2}-\d{2}\s+\w+\]\s+)?"
    r"\[([^\]]*)\]:\s*(.*)"
)

DURATION_SIMPLE_RE = re.compile(
    r"^(\d+(?:\.\d+)?)\s*"
    r"(h|hours?|m|min|mins|minutes?)$"
)

DURATION_COMPOUND_RE = re.compile(
    r"^(\d+)\s*h\s*(\d+)\s*"
    r"(?:m|min|mins|minutes?)?$"
)

# Empty set because clocks.org has no TODO keywords
CLOCK_KEYWORDS: set[str] = set()


# -- Timestamps & IDs ----------------------------------------

def current_timestamp() -> str:
    """Return the current local time as an ISO string.

    Keeps microsecond precision so lexicographic string
    comparisons in the sync cursor logic match datetime
    ordering without needing to parse.

    :returns: ISO-8601 timestamp with microseconds

    >>> import re
    >>> ts = current_timestamp()
    >>> bool(re.match(r"\\d{4}-\\d{2}-\\d{2}T", ts))
    True
    """
    return local_now().isoformat()


def generate_sync_id() -> str:
    """Generate a fresh UUIDv4 for a clock entry.

    Every clock entry carries a ``SYNC_ID`` that is shared
    between the local org file and the cloud database.
    This is the bidirectional sync identity.

    :returns: UUID string like ``"644e97a2-..."``

    >>> len(generate_sync_id())
    36
    """
    return str(uuid.uuid4())


# -- Parsing --------------------------------------------------

def parse_entry_title(title: str) -> tuple[str, str]:
    """Extract customer and description from a heading title.

    Supports both the current format
    ``[2026-04-17 Thu] [Acme]: Fix bug`` and the legacy
    format ``[Acme]: Fix bug``.

    :param title: Raw org heading title string.
    :returns: Tuple of ``(customer, description)``.

    >>> parse_entry_title("[2026-04-17 Thu] [Acme]: Fix")
    ('Acme', 'Fix')
    >>> parse_entry_title("[Acme]: Fix bug")
    ('Acme', 'Fix bug')
    >>> parse_entry_title("Some random text")
    ('', 'Some random text')
    """
    m = ENTRY_RE.match(title.strip())
    if m:
        return m.group(1), m.group(2).strip()
    return "", title.strip()


def format_entry_title(
    customer: str,
    description: str,
    dt: datetime | None = None,
) -> str:
    """Build an org heading title from parts.

    :param customer: Customer name.
    :param description: Entry description.
    :param dt: Timestamp for the date prefix. Defaults to
        now.
    :returns: Formatted title like
        ``[2026-04-17 Thu] [Acme]: Fix bug``.
    """
    if dt is None:
        dt = local_now()
    date_str = dt.strftime("%Y-%m-%d %a")
    return f"[{date_str}] [{customer}]: {description}"


def parse_duration(duration_str: str) -> int | None:
    """Parse a human-readable duration string into minutes.

    :param duration_str: Duration like ``"2h"``,
        ``"30min"``, ``"1h30m"``, ``"1.5h"``.
    :returns: Duration in minutes, or ``None`` if the
        string cannot be parsed.

    >>> parse_duration("2h")
    120
    >>> parse_duration("30m")
    30
    >>> parse_duration("1h30m")
    90
    >>> parse_duration("1.5h")
    90
    >>> parse_duration("invalid") is None
    True
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


# -- Date ranges ----------------------------------------------

def get_entry_date(entry: dict) -> date | None:
    """Extract the date from a clock entry's start field.

    :param entry: Clock entry dict with a ``"start"`` key.
    :returns: ``date`` object, or ``None`` if missing or
        unparseable.
    """
    start = entry.get("start")
    if not start:
        return None
    try:
        return datetime.fromisoformat(start).date()
    except ValueError:
        return None


def week_range(d: date) -> tuple[date, date]:
    """Return the Monday and Sunday of the ISO week
    containing ``d``.

    :param d: Any date.
    :returns: ``(monday, sunday)`` tuple.
    """
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def month_range(d: date) -> tuple[date, date]:
    """Return the first and last day of the month
    containing ``d``.

    :param d: Any date.
    :returns: ``(first, last)`` tuple.
    """
    first = d.replace(day=1)
    if d.month == 12:
        last = d.replace(day=31)
    else:
        last = d.replace(
            month=d.month + 1, day=1,
        ) - timedelta(days=1)
    return first, last


def entry_in_period(
    entry: dict,
    period: str,
    from_date: date | None = None,
    to_date: date | None = None,
) -> bool:
    """Check whether an entry falls within a named period
    or explicit date range.

    When ``from_date`` and ``to_date`` are both set, the
    named ``period`` is ignored.

    :param entry: Clock entry dict.
    :param period: One of ``"today"``, ``"week"``,
        ``"month"``, ``"year"``, ``"all"``.
    :param from_date: Inclusive start date (optional).
    :param to_date: Inclusive end date (optional).
    :returns: ``True`` if the entry is within range.
    """
    entry_dt = get_entry_date(entry)
    if entry_dt is None:
        return False
    today = date.today()

    if from_date and to_date:
        return from_date <= entry_dt <= to_date
    if period == "today":
        return entry_dt == today
    if period == "week":
        start, end = week_range(today)
        return start <= entry_dt <= end
    if period == "month":
        start, end = month_range(today)
        return start <= entry_dt <= end
    if period == "year":
        return entry_dt.year == today.year
    # "all" or unrecognised period — include everything
    return True


# -- Entry conversion -----------------------------------------

def extract_notes(heading: Heading) -> str | None:
    """Read the body text from a heading as free-form notes.

    :param heading: Org heading object.
    :returns: Joined body text, or ``None`` if empty.
    """
    text = "\n".join(heading.body).strip()
    return text or None


def clock_to_entry(
    clock: Clock,
    customer: str,
    description: str,
    task_id: str | None = None,
    invoiced: bool = False,
    notes: str | None = None,
    contract: str | None = None,
    sync_id: str | None = None,
    updated_at: str | None = None,
) -> dict:
    """Convert a Clock model + metadata into a clock entry
    dict suitable for API responses.

    :param clock: ``Clock`` with ``start`` and optional
        ``end`` datetime.
    :param customer: Customer name.
    :param description: Entry description.
    :param task_id: Optional linked task ID.
    :param invoiced: Whether this entry has been invoiced.
    :param notes: Free-form notes.
    :param contract: Contract name.
    :param sync_id: Bidirectional sync UUID.
    :param updated_at: Last-modified ISO timestamp.
    :returns: Dict with all entry fields.
    """
    duration_minutes = None
    if clock.end is not None:
        delta = clock.end - clock.start
        duration_minutes = int(delta.total_seconds() / 60)
    return {
        "sync_id": sync_id,
        "customer": customer,
        "description": description,
        "start": clock.start.isoformat(),
        "end": (
            clock.end.isoformat() if clock.end else None
        ),
        "duration_minutes": duration_minutes,
        "task_id": task_id,
        "invoiced": invoiced,
        "notes": notes or "",
        "contract": contract or None,
        "updated_at": updated_at,
    }


def ensure_sync_identity(
    heading: Heading,
    default_updated_at: str | None = None,
) -> tuple[str, str]:
    """Ensure a heading carries ``SYNC_ID`` and
    ``UPDATED_AT`` properties.

    If either is missing, generates a fresh value and
    marks the heading dirty so the next write persists
    the backfill. This is how legacy entries (created
    before the sync protocol) get their identity on
    first read.

    :param heading: Org heading to inspect/stamp.
    :param default_updated_at: Fallback timestamp if
        ``UPDATED_AT`` is missing. Defaults to now.
    :returns: ``(sync_id, updated_at)`` tuple.
    """
    sync_id = heading.properties.get("SYNC_ID") or ""
    updated_at = heading.properties.get(
        "UPDATED_AT",
    ) or ""
    changed = False
    if not sync_id:
        sync_id = generate_sync_id()
        heading.properties["SYNC_ID"] = sync_id
        changed = True
    if not updated_at:
        updated_at = default_updated_at or (
            current_timestamp()
        )
        heading.properties["UPDATED_AT"] = updated_at
        changed = True
    if changed:
        heading.dirty = True
    return sync_id, updated_at


def heading_to_entry(
    heading: Heading, clock: Clock,
) -> dict:
    """Read all entry fields off a heading/clock pair and
    return a clock entry dict.

    Also ensures the heading has a sync identity
    (backfills ``SYNC_ID``/``UPDATED_AT`` if missing).

    :param heading: Org heading containing the entry.
    :param clock: The CLOCK logbook line.
    :returns: Complete clock entry dict.
    """
    customer, desc = parse_entry_title(heading.title)
    task_id = heading.properties.get("TASK_ID") or None
    invoiced = (
        heading.properties.get(
            "INVOICED", "",
        ).lower() == "true"
    )
    from_cloud = (
        heading.properties.get(
            "FROM_CLOUD", "",
        ).lower() == "true"
    )
    notes = extract_notes(heading)
    contract = heading.properties.get("CONTRACT") or None
    sync_id, updated_at = ensure_sync_identity(heading)
    entry = clock_to_entry(
        clock, customer, desc,
        task_id, invoiced, notes, contract,
        sync_id=sync_id, updated_at=updated_at,
    )
    if from_cloud:
        entry["from_cloud"] = True
    return entry


# -- Org file operations --------------------------------------

def collect_entry(org_file: OrgFile) -> list[dict]:
    """Flat-map all headings × clocks into entry dicts.

    Each heading typically has one CLOCK line (new format).
    Legacy multi-clock headings are still supported for
    backwards compatibility.

    :param org_file: Parsed org file.
    :returns: List of clock entry dicts.
    """
    return [
        heading_to_entry(h, clock)
        for h in org_file.headings
        for clock in h.logbook
    ]


def persist_backfill(
    clocks_file: Path, org_file: OrgFile,
) -> bool:
    """Write back the org file if any heading was dirtied
    during a read pass (e.g. sync identity backfill).

    :param clocks_file: Path to clocks.org.
    :param org_file: Parsed org file (possibly dirty).
    :returns: ``True`` if the file was rewritten.
    """
    dirty = any(h.dirty for h in org_file.headings)
    if dirty:
        write_org_file(clocks_file, org_file)
    return dirty


def find_by_start(
    org_file: OrgFile, start_iso: str,
) -> tuple[Clock, Heading] | None:
    """Find a clock entry by its start timestamp.

    :param org_file: Parsed org file.
    :param start_iso: ISO-8601 start timestamp to match.
    :returns: ``(clock, heading)`` tuple, or ``None``.
    """
    try:
        target = datetime.fromisoformat(start_iso)
    except ValueError:
        return None
    for h in org_file.headings:
        for clock in h.logbook:
            if clock.start == target:
                return clock, h
    return None


def find_by_sync_id(
    org_file: OrgFile, sync_id: str,
) -> tuple[Clock, Heading] | None:
    """Find a clock entry by its ``SYNC_ID`` property.

    :param org_file: Parsed org file.
    :param sync_id: UUID to match.
    :returns: ``(clock, heading)`` tuple, or ``None``.
    """
    for h in org_file.headings:
        if h.properties.get("SYNC_ID") != sync_id:
            continue
        if h.logbook:
            return h.logbook[0], h
    return None


def append_entry(
    clocks_file: Path,
    customer: str,
    description: str,
    clock: Clock,
    task_id: str | None = None,
    contract: str | None = None,
    notes: str | None = None,
    sync_id: str | None = None,
    updated_at: str | None = None,
    invoiced: bool = False,
    from_cloud: bool = False,
) -> None:
    """Append a new clock entry to the org file.

    Each entry becomes its own level-1 heading with a
    single CLOCK logbook line. ``sync_id`` and
    ``updated_at`` default to fresh values when omitted,
    so every entry always has a sync identity.

    :param clocks_file: Path to clocks.org.
    :param customer: Customer name.
    :param description: Entry description.
    :param clock: ``Clock`` model with start/end.
    :param task_id: Optional linked task ID.
    :param contract: Optional contract name.
    :param notes: Optional free-form notes.
    :param sync_id: Sync UUID (generated if omitted).
    :param updated_at: Timestamp (generated if omitted).
    :param invoiced: Whether the entry is invoiced.
    :param from_cloud: Mark as needing triage.
    """
    if not clocks_file.exists():
        clocks_file.parent.mkdir(
            parents=True, exist_ok=True,
        )
        org_file = OrgFile()
        # Header comment so Emacs users know not to
        # remove the sync properties.
        org_file.preamble = [
            "# Kaisho clock entries.",
            "# Do not remove :SYNC_ID: or :UPDATED_AT:"
            " properties —",
            "# they link entries to the cloud. Removing"
            " one causes a duplicate.",
        ]
    else:
        org_file = parse_org_file(
            clocks_file, CLOCK_KEYWORDS,
        )

    title = format_entry_title(
        customer, description, clock.start,
    )
    heading = Heading(
        level=1, keyword=None, title=title, dirty=True,
    )
    if task_id:
        heading.properties["TASK_ID"] = task_id
    if contract:
        heading.properties["CONTRACT"] = contract
    if invoiced:
        heading.properties["INVOICED"] = "true"
    if from_cloud:
        heading.properties["FROM_CLOUD"] = "true"
    heading.properties["SYNC_ID"] = (
        sync_id or generate_sync_id()
    )
    heading.properties["UPDATED_AT"] = (
        updated_at or current_timestamp()
    )
    if notes:
        heading.body = notes.splitlines()
    heading.logbook.append(clock)
    org_file.headings.append(heading)

    write_org_file(clocks_file, org_file)


# -- Heading mutation helpers ----------------------------------
#
# These apply individual field updates to a heading in
# place. Used by ``update_clock_entry`` and the sync
# protocol's ``apply_sync_payload``.

def set_or_pop_property(
    props: dict, key: str, value: str | None,
) -> None:
    """Set a property if the value is truthy, remove it
    otherwise.

    :param props: Heading properties dict (mutated).
    :param key: Property key like ``"TASK_ID"``.
    :param value: New value, or ``None``/``""`` to remove.
    """
    if value:
        props[key] = value
    else:
        props.pop(key, None)


def apply_title_update(
    heading: Heading,
    clock: Clock,
    customer: str | None,
    description: str | None,
    current_customer: str,
    current_desc: str,
) -> tuple[str, str]:
    """Update the heading title if customer or description
    changed.

    :param heading: Org heading to mutate.
    :param clock: Clock (for its start date).
    :param customer: New customer, or ``None`` to keep.
    :param description: New description, or ``None``.
    :param current_customer: Current customer value.
    :param current_desc: Current description value.
    :returns: ``(customer, description)`` after update.
    """
    if customer is not None:
        current_customer = customer
    if description is not None:
        current_desc = description
    if customer is not None or description is not None:
        heading.title = format_entry_title(
            current_customer, current_desc, clock.start,
        )
        heading.dirty = True
    return current_customer, current_desc


def apply_date_update(
    heading: Heading,
    clock: Clock,
    new_date: date | None,
    customer: str,
    desc: str,
) -> None:
    """Shift the clock start/end to a different date,
    preserving the time-of-day.

    :param heading: Org heading to mutate.
    :param clock: Clock to shift.
    :param new_date: Target date, or ``None`` to skip.
    :param customer: Current customer (for title rebuild).
    :param desc: Current description (for title rebuild).
    """
    if new_date is None:
        return
    delta = timedelta(
        days=(new_date - clock.start.date()).days,
    )
    clock.start = clock.start + delta
    if clock.end is not None:
        clock.end = clock.end + delta
    heading.title = format_entry_title(
        customer, desc, clock.start,
    )
    heading.dirty = True


def apply_start_time_update(
    heading: Heading,
    clock: Clock,
    start_time: str | None,
) -> None:
    """Change the clock's start time while preserving its
    duration.

    :param heading: Org heading to mutate.
    :param clock: Clock to adjust.
    :param start_time: New time as ``"HH:MM"``, or
        ``None`` to skip.
    """
    if start_time is None:
        return
    h, m = (int(x) for x in start_time.split(":"))
    duration = (
        (clock.end - clock.start)
        if clock.end
        else timedelta()
    )
    clock.start = clock.start.replace(
        hour=h, minute=m, second=0,
    )
    if clock.end is not None:
        clock.end = clock.start + duration
    heading.dirty = True


def apply_hours_update(
    heading: Heading,
    clock: Clock,
    hours: float | None,
) -> None:
    """Set the clock duration to a specific number of
    hours.

    Recomputes ``end`` from ``start + hours``.

    :param heading: Org heading to mutate.
    :param clock: Clock to adjust.
    :param hours: New duration in decimal hours, or
        ``None`` to skip.
    """
    if hours is None:
        return
    minutes = int(hours * 60)
    clock.end = clock.start + timedelta(minutes=minutes)
    h = minutes // 60
    m = minutes % 60
    clock.duration = f"{h}:{m:02d}"
    heading.dirty = True


def apply_property_updates(
    heading: Heading,
    task_id: str | None,
    invoiced: bool | None,
    notes: str | None,
    contract: str | None,
) -> None:
    """Apply optional property changes to a heading.

    Each parameter is ``None`` to skip (no change) or a
    value to set. Empty strings clear the property.

    :param heading: Org heading to mutate.
    :param task_id: Task ID to set/clear.
    :param invoiced: Invoice flag to set/clear.
    :param notes: Free-form notes to set/clear.
    :param contract: Contract name to set/clear.
    """
    if task_id is not None:
        if task_id == "":
            heading.properties.pop("TASK_ID", None)
        else:
            heading.properties["TASK_ID"] = task_id
        heading.dirty = True
    if invoiced is not None:
        if invoiced:
            heading.properties["INVOICED"] = "true"
        else:
            heading.properties.pop("INVOICED", None)
        heading.dirty = True
    if notes is not None:
        heading.body = (
            notes.splitlines() if notes.strip() else []
        )
        heading.dirty = True
    if contract is not None:
        if contract:
            heading.properties["CONTRACT"] = contract
        else:
            heading.properties.pop("CONTRACT", None)
        heading.dirty = True


def apply_sync_payload(
    heading: Heading, clock: Clock, fields: dict,
) -> None:
    """Overwrite a heading's fields from a cloud-origin
    sync payload.

    Used during ``pull_changes`` to apply remote edits to
    the local org file. The incoming ``updated_at`` is
    honoured verbatim so the sync cursor advances
    correctly.

    :param heading: Org heading to overwrite.
    :param clock: Clock to overwrite.
    :param fields: Wire payload dict with keys like
        ``sync_id``, ``customer``, ``start``, ``end``,
        ``updated_at``, etc.
    """
    start = datetime.fromisoformat(fields["start"])
    end_raw = fields.get("end")
    end = (
        datetime.fromisoformat(end_raw) if end_raw
        else None
    )

    clock.start = start
    clock.end = end
    if end is not None:
        delta = end - start
        total_minutes = int(delta.total_seconds() / 60)
        h = total_minutes // 60
        m = total_minutes % 60
        clock.duration = f"{h}:{m:02d}"
    else:
        clock.duration = None

    customer = fields.get("customer") or ""
    desc = fields.get("description") or ""
    heading.title = format_entry_title(
        customer, desc, start,
    )

    props = heading.properties
    set_or_pop_property(
        props, "TASK_ID", fields.get("task_id"),
    )
    set_or_pop_property(
        props, "CONTRACT", fields.get("contract"),
    )
    if fields.get("invoiced"):
        props["INVOICED"] = "true"
    else:
        props.pop("INVOICED", None)
    props["SYNC_ID"] = fields["sync_id"]
    props["UPDATED_AT"] = fields["updated_at"]

    notes = fields.get("notes") or ""
    heading.body = (
        notes.splitlines() if notes.strip() else []
    )
    heading.dirty = True


def find_by_content(
    org_file: OrgFile,
    start_iso: str,
    customer: str,
    description: str,
) -> tuple[Clock, Heading] | None:
    """Find a heading whose clock matches by start time,
    customer, and description — ignoring ``SYNC_ID``.

    Used to re-adopt a cloud UUID when a user accidentally
    removes the ``:SYNC_ID:`` property in Emacs. Without
    this, the entry would be duplicated on the next sync.

    The match is intentionally strict (all three fields
    must match) to avoid false positives.

    :param org_file: Parsed org file.
    :param start_iso: ISO start timestamp to match.
    :param customer: Customer name to match.
    :param description: Description to match.
    :returns: ``(clock, heading)`` or ``None``.
    """
    try:
        target = datetime.fromisoformat(start_iso)
    except ValueError:
        return None
    for h in org_file.headings:
        cust, desc = parse_entry_title(h.title)
        if cust != customer or desc != description:
            continue
        for clock in h.logbook:
            if clock.start == target:
                return clock, h
    return None


def adopt_sync_id(
    clocks_file: Path,
    sync_id: str,
    start_iso: str,
    customer: str,
    description: str,
) -> dict | None:
    """Try to re-adopt a cloud UUID for a local entry
    that lost its ``SYNC_ID`` (e.g. manual edit in Emacs).

    Finds a local entry matching by content (start +
    customer + description). If found, checks that no
    other heading already uses the given ``sync_id``
    (to prevent UUID collisions). If safe, stamps the
    UUID and returns the entry. Otherwise returns
    ``None``.

    :param clocks_file: Path to clocks.org.
    :param sync_id: The cloud UUID to adopt.
    :param start_iso: Start timestamp to match.
    :param customer: Customer name to match.
    :param description: Description to match.
    :returns: Entry dict if adopted, ``None`` otherwise.
    """
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)

    # Safety: another heading already has this UUID.
    # Don't touch it — let the duplicate happen instead
    # of corrupting two entries.
    if find_by_sync_id(org_file, sync_id) is not None:
        return None

    found = find_by_content(
        org_file, start_iso, customer, description,
    )
    if found is None:
        return None
    clock, heading = found

    heading.properties["SYNC_ID"] = sync_id
    heading.properties["UPDATED_AT"] = current_timestamp()
    heading.dirty = True
    write_org_file(clocks_file, org_file)
    return heading_to_entry(heading, clock)


# -- Public API ------------------------------------------------

def count_task_clock_entries(
    clocks_file: Path, task_id: str,
) -> int:
    """Count how many clock entries reference a given task.

    Used by the kanban board to show time-tracking stats
    per task.

    :param clocks_file: Path to clocks.org.
    :param task_id: Task ID to count.
    :returns: Number of matching entries.
    """
    if not clocks_file.exists() or not task_id:
        return 0
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    return sum(
        len(h.logbook)
        for h in org_file.headings
        if h.properties.get("TASK_ID") == task_id
    )


def list_entries(
    clocks_file: Path,
    period: str = "today",
    customer: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    task_id: str | None = None,
    contract: str | None = None,
) -> list[dict]:
    """List clock entries, filtered by period and optional
    criteria.

    :param clocks_file: Path to clocks.org.
    :param period: ``"today"``, ``"week"``, ``"month"``,
        ``"year"``, or ``"all"``.
    :param customer: Filter by customer name.
    :param from_date: Explicit start date (overrides
        period).
    :param to_date: Explicit end date (overrides period).
    :param task_id: Filter by task ID. When set, period
        filtering is skipped.
    :param contract: Filter by contract name.
    :returns: List of matching entry dicts.
    """
    if not clocks_file.exists():
        return []
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    all_entries = collect_entry(org_file)
    persist_backfill(clocks_file, org_file)
    result = []
    for entry in all_entries:
        if customer and entry["customer"] != customer:
            continue
        if (
            task_id is not None
            and entry["task_id"] != task_id
        ):
            continue
        if (
            contract is not None
            and entry.get("contract") != contract
        ):
            continue
        # Skip period filtering when task_id is set,
        # because task entries span arbitrary dates.
        if task_id is None and not entry_in_period(
            entry, period, from_date, to_date,
        ):
            continue
        result.append(entry)
    return result


def get_active_timer(clocks_file: Path) -> dict | None:
    """Return the currently running (open) clock entry, or
    ``None`` if no timer is active.

    An open entry has a CLOCK line with no end timestamp.

    :param clocks_file: Path to clocks.org.
    :returns: Entry dict, or ``None``.
    """
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    for h in org_file.headings:
        for clock in h.logbook:
            if clock.end is None:
                entry = heading_to_entry(h, clock)
                persist_backfill(clocks_file, org_file)
                return entry
    return None


def quick_book(
    clocks_file: Path,
    duration_str: str,
    customer: str,
    description: str,
    task_id: str | None = None,
    contract: str | None = None,
    target_date: date | None = None,
    notes: str | None = None,
    sync_id: str | None = None,
    updated_at: str | None = None,
    start_time: str | None = None,
) -> dict:
    """Book a completed time entry with a duration string.

    When ``start_time`` is set (ISO format), the entry
    uses that exact start and computes end from it.
    When only ``target_date`` is set, the entry is
    placed at noon. Otherwise, ``end`` is now and
    ``start`` is computed backwards from the duration.

    :param clocks_file: Path to clocks.org.
    :param duration_str: Human-readable duration like
        ``"1h30m"``.
    :param customer: Customer name.
    :param description: Entry description.
    :param target_date: Optional date to place the entry.
    :param notes: Optional free-form notes.
    :param sync_id: Sync UUID (generated if omitted).
    :param updated_at: Timestamp (generated if omitted).
    :param start_time: ISO start time; preserves
        original timestamps during import.
    :returns: The new entry dict.
    :raises ValueError: If the duration is unparseable.
    """
    minutes = parse_duration(duration_str)
    if minutes is None:
        raise ValueError(
            f"Invalid duration: {duration_str}"
        )

    if start_time:
        start = datetime.fromisoformat(start_time)
        end = start + timedelta(minutes=minutes)
    elif target_date:
        start = datetime(
            target_date.year, target_date.month,
            target_date.day, 12, 0, 0,
        )
        end = start + timedelta(minutes=minutes)
    else:
        end = local_now().replace(second=0, microsecond=0)
        start = end - timedelta(minutes=minutes)
        # Clamp to midnight if the duration crosses a day
        # boundary, so the entry stays on today.
        if start.date() < end.date():
            start = end.replace(hour=0, minute=0)

    clock = Clock(start=start, end=end)
    sid = sync_id or generate_sync_id()
    ts = updated_at or current_timestamp()

    append_entry(
        clocks_file, customer, description,
        clock, task_id, contract, notes,
        sync_id=sid, updated_at=ts,
    )
    return clock_to_entry(
        clock, customer, description,
        task_id, notes=notes, contract=contract,
        sync_id=sid, updated_at=ts,
    )


def start_timer(
    clocks_file: Path,
    customer: str,
    description: str,
    task_id: str | None = None,
    contract: str | None = None,
    sync_id: str | None = None,
    updated_at: str | None = None,
    start_at: datetime | None = None,
) -> dict:
    """Start a new running timer.

    :param clocks_file: Path to clocks.org.
    :param customer: Customer name.
    :param description: Entry description.
    :param start_at: Override the start timestamp
        (used by the sync protocol when reconciling).
    :returns: The new entry dict (``end`` is ``None``).
    :raises ValueError: If a timer is already running.
    """
    active = get_active_timer(clocks_file)
    if active is not None:
        cust = active["customer"]
        desc = active["description"]
        label = f"{cust}: {desc}" if cust else desc
        raise ValueError(
            f"Timer already running for {label}"
        )

    start = (
        start_at or local_now().replace(microsecond=0)
    )
    clock = Clock(start=start, end=None)
    sid = sync_id or generate_sync_id()
    ts = updated_at or current_timestamp()
    append_entry(
        clocks_file, customer, description, clock,
        task_id, contract,
        sync_id=sid, updated_at=ts,
    )
    return clock_to_entry(
        clock, customer, description, task_id,
        contract=contract,
        sync_id=sid, updated_at=ts,
    )


def stop_timer(
    clocks_file: Path,
    end_at: datetime | None = None,
) -> dict:
    """Stop the currently running timer.

    :param clocks_file: Path to clocks.org.
    :param end_at: Override the end timestamp (used by
        the sync protocol for precise stop-at times).
    :returns: The completed entry dict.
    :raises ValueError: If no timer is running.
    """
    if not clocks_file.exists():
        raise ValueError("No active timer found")

    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    found_clock = None
    found_heading = None

    for h in org_file.headings:
        for clock in h.logbook:
            if clock.end is None:
                found_clock = clock
                found_heading = h
                break
        if found_clock:
            break

    if found_clock is None or found_heading is None:
        raise ValueError("No active timer found")

    end = end_at or local_now().replace(microsecond=0)
    delta = end - found_clock.start
    total_minutes = int(delta.total_seconds() / 60)
    hours = total_minutes // 60
    mins = total_minutes % 60
    found_clock.end = end
    found_clock.duration = f"{hours}:{mins:02d}"
    found_heading.properties["UPDATED_AT"] = (
        current_timestamp()
    )
    found_heading.dirty = True

    write_org_file(clocks_file, org_file)
    return heading_to_entry(found_heading, found_clock)


def get_summary(
    clocks_file: Path,
    period: str = "month",
) -> list[dict]:
    """Aggregate hours per customer for a given period.

    :param clocks_file: Path to clocks.org.
    :param period: Named period to aggregate.
    :returns: List of ``{customer, minutes, hours}``
        dicts, sorted by customer name.
    """
    entries = list_entries(clocks_file, period=period)
    totals: dict[str, int] = {}
    for entry in entries:
        customer = entry["customer"]
        minutes = entry.get("duration_minutes") or 0
        totals[customer] = (
            totals.get(customer, 0) + minutes
        )

    return [
        {
            "customer": customer,
            "minutes": minutes,
            "hours": round(minutes / 60, 1),
        }
        for customer, minutes in sorted(totals.items())
    ]


def update_clock_entry(
    clocks_file: Path,
    start_iso: str | None = None,
    customer: str | None = None,
    description: str | None = None,
    hours: float | None = None,
    new_date: date | None = None,
    start_time: str | None = None,
    task_id: str | None = None,
    invoiced: bool | None = None,
    notes: str | None = None,
    contract: str | None = None,
    sync_id: str | None = None,
) -> dict | None:
    """Update fields of a clock entry.

    Identifies the entry by ``sync_id`` when given, else
    by ``start_iso``. Prefer ``sync_id`` for callers that
    have it: ``start_iso`` is not unique when two entries
    happen to start at the same minute, so identifying by
    sync ID is the only collision-free option.

    Only the fields that are not ``None`` are changed.
    Automatically bumps ``UPDATED_AT`` and ensures a
    sync identity exists.

    :param clocks_file: Path to clocks.org.
    :param start_iso: ISO start timestamp of the entry.
    :param customer: New customer name.
    :param description: New description.
    :param hours: New duration in decimal hours.
    :param new_date: Shift the entry to this date.
    :param start_time: New start time (``"HH:MM"``).
    :param task_id: New task ID.
    :param invoiced: New invoiced flag.
    :param notes: New free-form notes.
    :param contract: New contract name.
    :param sync_id: Sync UUID; preferred over
        ``start_iso`` when provided.
    :returns: Updated entry dict, or ``None`` if not
        found.
    """
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    if sync_id:
        result = find_by_sync_id(org_file, sync_id)
    elif start_iso:
        result = find_by_start(org_file, start_iso)
    else:
        return None
    if result is None:
        return None
    clock, heading = result

    cur_cust, cur_desc = parse_entry_title(heading.title)
    cur_cust, cur_desc = apply_title_update(
        heading, clock, customer, description,
        cur_cust, cur_desc,
    )
    apply_date_update(
        heading, clock, new_date, cur_cust, cur_desc,
    )
    apply_start_time_update(heading, clock, start_time)
    apply_hours_update(heading, clock, hours)
    apply_property_updates(
        heading, task_id, invoiced, notes, contract,
    )
    heading.properties.pop("FROM_CLOUD", None)
    heading.properties["UPDATED_AT"] = current_timestamp()
    ensure_sync_identity(heading)
    heading.dirty = True

    write_org_file(clocks_file, org_file)
    return heading_to_entry(heading, clock)


def update_clock_entry_by_sync_id(
    clocks_file: Path,
    sync_id: str,
    fields: dict,
) -> dict | None:
    """Apply a cloud-origin change to a local entry,
    identified by its sync ID.

    Implements last-writer-wins: if the incoming
    ``updated_at`` is older than the local one, the
    update is silently skipped (the local version is
    newer and will win on the next push).

    :param clocks_file: Path to clocks.org.
    :param sync_id: UUID of the entry to update.
    :param fields: Wire payload from ``/sync/changes``.
    :returns: Entry dict (updated or unchanged), or
        ``None`` if the sync ID doesn't exist locally.
    """
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    found = find_by_sync_id(org_file, sync_id)
    if found is None:
        return None
    clock, heading = found

    # Last-writer-wins: skip stale incoming changes
    existing_updated = heading.properties.get(
        "UPDATED_AT", "",
    )
    incoming_updated = fields.get("updated_at", "")
    if (
        existing_updated and incoming_updated
        and incoming_updated <= existing_updated
    ):
        return heading_to_entry(heading, clock)

    apply_sync_payload(heading, clock, fields)
    write_org_file(clocks_file, org_file)
    return heading_to_entry(heading, clock)


def insert_clock_entry_from_sync(
    clocks_file: Path,
    fields: dict,
) -> dict:
    """Insert a new entry from a cloud sync payload.

    Used when ``pull_changes`` encounters a sync ID that
    doesn't exist locally. Honours the incoming
    ``updated_at`` verbatim.

    :param clocks_file: Path to clocks.org.
    :param fields: Wire payload with ``sync_id``,
        ``start``, ``end``, ``customer``, etc.
    :returns: The new entry dict.
    """
    start = datetime.fromisoformat(fields["start"])
    end_raw = fields.get("end")
    end = (
        datetime.fromisoformat(end_raw) if end_raw
        else None
    )
    clock = Clock(start=start, end=end)
    customer = fields.get("customer") or ""
    append_entry(
        clocks_file,
        customer=customer,
        description=fields.get("description") or "",
        clock=clock,
        task_id=fields.get("task_id"),
        contract=fields.get("contract"),
        notes=fields.get("notes") or None,
        sync_id=fields["sync_id"],
        updated_at=fields["updated_at"],
        invoiced=bool(fields.get("invoiced")),
        from_cloud=not customer,
    )
    return clock_to_entry(
        clock,
        customer=fields.get("customer") or "",
        description=fields.get("description") or "",
        task_id=fields.get("task_id"),
        invoiced=bool(fields.get("invoiced")),
        notes=fields.get("notes"),
        contract=fields.get("contract"),
        sync_id=fields["sync_id"],
        updated_at=fields["updated_at"],
    )


def delete_clock_entry(
    clocks_file: Path,
    start_iso: str,
) -> dict | None:
    """Delete a clock entry by its start timestamp.

    Returns the deleted entry so the caller can record a
    sync tombstone. Returns ``None`` if nothing matched.

    :param clocks_file: Path to clocks.org.
    :param start_iso: ISO start timestamp to match.
    :returns: Deleted entry dict, or ``None``.
    """
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    try:
        target = datetime.fromisoformat(start_iso)
    except ValueError:
        return None
    for h in org_file.headings:
        for clock in h.logbook:
            if clock.start == target:
                entry = heading_to_entry(h, clock)
                org_file.headings.remove(h)
                write_org_file(clocks_file, org_file)
                return entry
    return None


def delete_clock_entry_by_sync_id(
    clocks_file: Path,
    sync_id: str,
) -> dict | None:
    """Delete a clock entry by its sync ID.

    Used by the sync protocol when the cloud propagates
    a deletion. Returns the deleted entry for tombstone
    recording, or ``None`` if not found.

    :param clocks_file: Path to clocks.org.
    :param sync_id: UUID of the entry to delete.
    :returns: Deleted entry dict, or ``None``.
    """
    if not clocks_file.exists():
        return None
    org_file = parse_org_file(clocks_file, CLOCK_KEYWORDS)
    found = find_by_sync_id(org_file, sync_id)
    if found is None:
        return None
    clock, heading = found
    entry = heading_to_entry(heading, clock)
    org_file.headings.remove(heading)
    write_org_file(clocks_file, org_file)
    return entry
