"""JSON backend using JSON files as storage.

Each domain gets its own JSON file inside a configurable directory
(default: data/markdown/). The backend stores data as JSON arrays
for simpler parsing and writing.

Set BACKEND=json in .env to activate.
"""
import hashlib
import json
import re
import tempfile
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

from ...time_utils import local_now_naive as _local_now

from ..base import (
    ClockBackend,
    CustomerBackend,
    InboxBackend,
    NotesBackend,
    TaskBackend,
)


# -- JSON helpers ----------------------------------------------------


def _read_json(path: Path) -> list[dict]:
    """Read a JSON array from *path*, returning [] if missing."""
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else []


def _write_json(path: Path, data: list[dict]) -> None:
    """Atomically write *data* as a JSON array to *path*."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=path.parent, suffix=".tmp"
    )
    try:
        with open(tmp_fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        Path(tmp_path).replace(path)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def _generate_id(seed: str) -> str:
    """Return a 12-char hex ID derived from *seed* + now."""
    raw = f"{seed}{datetime.now().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


# -- Duration parsing ------------------------------------------------

_DURATION_RE = re.compile(
    r"(?:(\d+)\s*h)?[\s,]*(?:(\d+)\s*m(?:in)?)?",
    re.IGNORECASE,
)


def _parse_duration_minutes(duration_str: str) -> int:
    """Parse '2h', '30min', '1h30m' into total minutes."""
    m = _DURATION_RE.match(duration_str.strip())
    if not m or (not m.group(1) and not m.group(2)):
        raise ValueError(
            f"Cannot parse duration: {duration_str!r}"
        )
    hours = int(m.group(1)) if m.group(1) else 0
    mins = int(m.group(2)) if m.group(2) else 0
    return hours * 60 + mins


# -- Period filtering ------------------------------------------------


def _period_range(period: str) -> tuple[date, date]:
    """Return (start_date, end_date) for a named period."""
    today = date.today()
    if period == "today":
        return today, today
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, today
    if period == "month":
        start = today.replace(day=1)
        return start, today
    return date.min, date.max


def _entry_in_range(
    entry: dict,
    start: date,
    end: date,
) -> bool:
    """Check if a clock entry falls within [start, end]."""
    entry_start = entry.get("start", "")
    if not entry_start:
        return False
    entry_date = datetime.fromisoformat(entry_start).date()
    return start <= entry_date <= end


# -- Auto-categorize for inbox ---------------------------------------


def _guess_inbox_type(text: str) -> str:
    """Simple heuristic to categorise inbox items."""
    lower = text.lower()
    if any(w in lower for w in ("bug", "fix", "error", "broken")):
        return "bug"
    if any(w in lower for w in ("idea", "feature", "request")):
        return "feature"
    if any(w in lower for w in ("call", "meet", "email", "mail")):
        return "communication"
    return "note"


# ====================================================================
#  TaskBackend
# ====================================================================


class JsonTaskBackend(TaskBackend):
    def __init__(self, tasks_file: Path, archive_file: Path):
        self._tasks_file = tasks_file
        self._archive_file = archive_file

    @property
    def data_file(self) -> Path:
        return self._tasks_file

    # -- queries -------------------------------------------------

    def list_tasks(
        self,
        status=None,
        customer=None,
        tag=None,
        include_done=False,
    ) -> list[dict]:
        tasks = _read_json(self._tasks_file)
        if not include_done:
            tasks = [
                t for t in tasks
                if t.get("status", "") != "DONE"
            ]
        if status:
            allowed = (
                status if isinstance(status, list)
                else [status]
            )
            tasks = [
                t for t in tasks
                if t.get("status") in allowed
            ]
        if customer:
            low = customer.lower()
            tasks = [
                t for t in tasks
                if t.get("customer", "").lower() == low
            ]
        if tag:
            tasks = [
                t for t in tasks
                if tag in t.get("tags", [])
            ]
        return tasks

    def list_all_tags(self) -> list[dict]:
        tasks = _read_json(self._tasks_file)
        counter: Counter = Counter()
        for t in tasks:
            for tg in t.get("tags", []):
                counter[tg] += 1
        return [
            {"name": name, "count": count}
            for name, count in counter.most_common()
        ]

    def list_archived(self) -> list[dict]:
        return _read_json(self._archive_file)

    # -- mutations -----------------------------------------------

    def add_task(
        self,
        customer,
        title,
        status="TODO",
        tags=None,
        body=None,
        github_url=None,
    ) -> dict:
        tasks = _read_json(self._tasks_file)
        task = {
            "id": _generate_id(title),
            "customer": customer,
            "title": title,
            "status": status,
            "tags": tags or [],
            "body": body or "",
            "github_url": github_url or "",
            "properties": {},
            "created": datetime.now().isoformat(),
        }
        tasks.append(task)
        _write_json(self._tasks_file, tasks)
        return task

    def move_task(self, task_id, new_status) -> dict:
        tasks = _read_json(self._tasks_file)
        for t in tasks:
            if t["id"] == task_id:
                t["status"] = new_status
                _write_json(self._tasks_file, tasks)
                return t
        raise ValueError(f"Task not found: {task_id}")

    def set_tags(self, task_id, tags) -> dict:
        tasks = _read_json(self._tasks_file)
        for t in tasks:
            if t["id"] == task_id:
                t["tags"] = list(tags)
                _write_json(self._tasks_file, tasks)
                return t
        raise ValueError(f"Task not found: {task_id}")

    def update_task(
        self,
        task_id,
        title=None,
        customer=None,
        body=None,
        github_url=None,
    ) -> dict:
        tasks = _read_json(self._tasks_file)
        for t in tasks:
            if t["id"] == task_id:
                if title is not None:
                    t["title"] = title
                if customer is not None:
                    t["customer"] = customer
                if body is not None:
                    t["body"] = body
                if github_url is not None:
                    t["github_url"] = github_url
                _write_json(self._tasks_file, tasks)
                return t
        raise ValueError(f"Task not found: {task_id}")

    def archive_task(self, task_id) -> bool:
        tasks = _read_json(self._tasks_file)
        target = None
        remaining = []
        for t in tasks:
            if t["id"] == task_id:
                target = t
            else:
                remaining.append(t)
        if target is None:
            return False
        archive = _read_json(self._archive_file)
        target["archived_at"] = datetime.now().isoformat()
        target["archive_status"] = target.get("status", "")
        archive.append(target)
        _write_json(self._tasks_file, remaining)
        _write_json(self._archive_file, archive)
        return True

    def unarchive_task(self, task_id: str) -> bool:
        archive = _read_json(self._archive_file)
        target = None
        remaining = []
        for t in archive:
            if t["id"] == task_id:
                target = t
            else:
                remaining.append(t)
        if target is None:
            return False
        target.pop("archived_at", None)
        target.pop("archive_status", None)
        tasks = _read_json(self._tasks_file)
        tasks.append(target)
        _write_json(self._archive_file, remaining)
        _write_json(self._tasks_file, tasks)
        return True


# ====================================================================
#  ClockBackend
# ====================================================================


class JsonClockBackend(ClockBackend):
    def __init__(self, clocks_file: Path) -> None:
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        return self._clocks_file

    # -- helpers -------------------------------------------------

    def _duration_minutes(self, entry: dict) -> int:
        """Compute duration in minutes for a finished entry."""
        start = datetime.fromisoformat(entry["start"])
        end_str = entry.get("end")
        if not end_str:
            end = _local_now()
        else:
            end = datetime.fromisoformat(end_str)
        return max(
            0, int((end - start).total_seconds() / 60)
        )

    def _enrich(self, entry: dict) -> dict:
        """Add computed duration_minutes field."""
        entry["duration_minutes"] = (
            self._duration_minutes(entry)
        )
        return entry

    # -- queries -------------------------------------------------

    def list_entries(
        self,
        period="today",
        customer=None,
        from_date: date | None = None,
        to_date: date | None = None,
        task_id=None,
        contract=None,
    ) -> list[dict]:
        entries = _read_json(self._clocks_file)
        if task_id:
            entries = [
                e for e in entries
                if e.get("task_id") == task_id
            ]
        elif from_date or to_date:
            sd = from_date or date.min
            ed = to_date or date.max
            entries = [
                e for e in entries
                if _entry_in_range(e, sd, ed)
            ]
        else:
            sd, ed = _period_range(period)
            entries = [
                e for e in entries
                if _entry_in_range(e, sd, ed)
            ]
        if customer:
            low = customer.lower()
            entries = [
                e for e in entries
                if e.get("customer", "").lower() == low
            ]
        if contract:
            entries = [
                e for e in entries
                if e.get("contract") == contract
            ]
        return [self._enrich(e) for e in entries]

    def get_active(self) -> dict | None:
        for entry in _read_json(self._clocks_file):
            if entry.get("end") is None:
                return self._enrich(entry)
        return None

    def get_summary(self, period="month") -> list[dict]:
        entries = self.list_entries(period=period)
        totals: dict[str, int] = {}
        for e in entries:
            cust = e.get("customer", "unknown")
            totals[cust] = (
                totals.get(cust, 0)
                + e["duration_minutes"]
            )
        return [
            {
                "customer": cust,
                "minutes": mins,
                "hours": round(mins / 60, 2),
            }
            for cust, mins in sorted(totals.items())
        ]

    # -- mutations -----------------------------------------------

    def start(
        self,
        customer,
        description,
        task_id=None,
        contract=None,
    ) -> dict:
        if self.get_active() is not None:
            raise ValueError(
                "A clock entry is already running"
            )
        entries = _read_json(self._clocks_file)
        entry = {
            "customer": customer,
            "description": description,
            "start": _local_now().isoformat(),
            "end": None,
            "task_id": task_id or "",
            "contract": contract or "",
            "booked": False,
            "notes": "",
        }
        entries.append(entry)
        _write_json(self._clocks_file, entries)
        return self._enrich(entry)

    def stop(self) -> dict:
        entries = _read_json(self._clocks_file)
        for entry in entries:
            if entry.get("end") is None:
                entry["end"] = _local_now().isoformat()
                _write_json(self._clocks_file, entries)
                return self._enrich(entry)
        raise ValueError("No running clock entry")

    def quick_book(
        self,
        duration_str,
        customer,
        description,
        task_id=None,
        contract=None,
        target_date=None,
    ) -> dict:
        minutes = _parse_duration_minutes(duration_str)
        if target_date:
            start = datetime(
                target_date.year, target_date.month,
                target_date.day, 12, 0, 0,
            )
            end = start + timedelta(minutes=minutes)
        else:
            end = _local_now().replace(
                second=0, microsecond=0
            )
            start = end - timedelta(minutes=minutes)
            if start.date() < end.date():
                start = end.replace(hour=0, minute=0)
        entries = _read_json(self._clocks_file)
        entry = {
            "customer": customer,
            "description": description,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "task_id": task_id or "",
            "contract": contract or "",
            "booked": False,
            "notes": "",
        }
        entries.append(entry)
        _write_json(self._clocks_file, entries)
        return self._enrich(entry)

    def update_entry(
        self,
        start_iso: str,
        customer: str | None = None,
        description: str | None = None,
        hours: float | None = None,
        new_date=None,
        start_time: str | None = None,
        task_id: str | None = None,
        booked: bool | None = None,
        notes: str | None = None,
        contract: str | None = None,
    ) -> dict | None:
        entries = _read_json(self._clocks_file)
        for entry in entries:
            if entry.get("start") != start_iso:
                continue
            if customer is not None:
                entry["customer"] = customer
            if description is not None:
                entry["description"] = description
            if task_id is not None:
                entry["task_id"] = task_id
            if booked is not None:
                entry["booked"] = booked
            if notes is not None:
                entry["notes"] = notes
            if contract is not None:
                entry["contract"] = contract
            if start_time is not None:
                old_start = datetime.fromisoformat(
                    entry["start"]
                )
                h, m = (int(x) for x in start_time.split(":"))
                new_start = old_start.replace(
                    hour=h, minute=m,
                )
                delta = new_start - old_start
                entry["start"] = new_start.isoformat()
                if entry.get("end"):
                    old_end = datetime.fromisoformat(
                        entry["end"]
                    )
                    entry["end"] = (
                        old_end + delta
                    ).isoformat()
            if hours is not None:
                start_dt = datetime.fromisoformat(
                    entry["start"]
                )
                entry["end"] = (
                    start_dt + timedelta(hours=hours)
                ).isoformat()
            if new_date is not None:
                old_start = datetime.fromisoformat(
                    entry["start"]
                )
                new_start = old_start.replace(
                    year=new_date.year,
                    month=new_date.month,
                    day=new_date.day,
                )
                delta = new_start - old_start
                entry["start"] = new_start.isoformat()
                if entry.get("end"):
                    old_end = datetime.fromisoformat(
                        entry["end"]
                    )
                    entry["end"] = (
                        old_end + delta
                    ).isoformat()
            _write_json(self._clocks_file, entries)
            return self._enrich(entry)
        return None

    def delete_entry(self, start_iso) -> bool:
        entries = _read_json(self._clocks_file)
        new = [
            e for e in entries
            if e.get("start") != start_iso
        ]
        if len(new) == len(entries):
            return False
        _write_json(self._clocks_file, new)
        return True


# ====================================================================
#  InboxBackend
# ====================================================================


class JsonInboxBackend(InboxBackend):
    def __init__(self, inbox_file: Path) -> None:
        self._inbox_file = inbox_file

    @property
    def data_file(self) -> Path:
        return self._inbox_file

    def list_items(self) -> list[dict]:
        items = _read_json(self._inbox_file)
        for idx, item in enumerate(items, 1):
            item.setdefault("id", str(idx))
        return items

    def add_item(
        self,
        text,
        item_type=None,
        customer=None,
        body=None,
        channel=None,
        direction=None,
    ) -> dict:
        items = _read_json(self._inbox_file)
        item = {
            "id": _generate_id(text),
            "type": item_type or _guess_inbox_type(text),
            "customer": customer or "",
            "title": text,
            "body": body or "",
            "channel": channel or "",
            "direction": direction or "",
            "created": datetime.now().isoformat(),
            "properties": {},
        }
        items.append(item)
        _write_json(self._inbox_file, items)
        return item

    def remove_item(self, item_id) -> bool:
        items = _read_json(self._inbox_file)
        new = [i for i in items if i.get("id") != item_id]
        if len(new) == len(items):
            return False
        _write_json(self._inbox_file, new)
        return True

    def update_item(self, item_id, updates) -> dict:
        items = _read_json(self._inbox_file)
        for item in items:
            if item.get("id") == item_id:
                item.update(updates)
                _write_json(self._inbox_file, items)
                return item
        raise ValueError(
            f"Inbox item not found: {item_id}"
        )

    def promote_to_task(
        self, item_id, tasks, customer
    ) -> dict:
        items = _read_json(self._inbox_file)
        target = None
        remaining = []
        for item in items:
            if item.get("id") == item_id:
                target = item
            else:
                remaining.append(item)
        if target is None:
            raise ValueError(
                f"Inbox item not found: {item_id}"
            )
        task = tasks.add_task(
            customer=customer,
            title=target.get("title", ""),
            status="TODO",
            body=target.get("body") or None,
        )
        _write_json(self._inbox_file, remaining)
        return task


# ====================================================================
#  CustomerBackend
# ====================================================================


class JsonCustomerBackend(CustomerBackend):
    def __init__(
        self, customers_file: Path, clocks_file: Path
    ) -> None:
        self._customers_file = customers_file
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        return self._customers_file

    # -- helpers -------------------------------------------------

    def _used_hours(self, customer_name: str) -> float:
        """Sum booked hours from clocks."""
        entries = _read_json(self._clocks_file)
        total_min = 0
        low = customer_name.lower()
        for e in entries:
            if e.get("customer", "").lower() != low:
                continue
            start_str = e.get("start")
            end_str = e.get("end")
            if not start_str or not end_str:
                continue
            start = datetime.fromisoformat(start_str)
            end = datetime.fromisoformat(end_str)
            total_min += max(
                0,
                int((end - start).total_seconds() / 60),
            )
        return round(total_min / 60, 2)

    def _contract_used_hours(
        self, customer_name: str, contract_name: str
    ) -> float:
        """Sum hours for a specific contract."""
        entries = _read_json(self._clocks_file)
        total_min = 0
        low = customer_name.lower()
        for e in entries:
            if e.get("customer", "").lower() != low:
                continue
            if e.get("contract") != contract_name:
                continue
            start_str = e.get("start")
            end_str = e.get("end")
            if not start_str or not end_str:
                continue
            start = datetime.fromisoformat(start_str)
            end = datetime.fromisoformat(end_str)
            total_min += max(
                0,
                int((end - start).total_seconds() / 60),
            )
        return round(total_min / 60, 2)

    def _enrich_customer(self, cust: dict) -> dict:
        """Add computed budget fields."""
        hours = self._used_hours(cust["name"])
        budget = cust.get("budget", 0)
        cust["used"] = hours
        cust["rest"] = round(budget - hours, 2)
        return cust

    def _enrich_contract(
        self, cust_name: str, con: dict
    ) -> dict:
        """Add computed budget fields to a contract."""
        hours = self._contract_used_hours(
            cust_name, con["name"]
        )
        budget = con.get("budget", 0)
        con["used"] = hours
        con["rest"] = round(budget - hours, 2)
        return con

    # -- queries -------------------------------------------------

    def list_customers(
        self, include_inactive=False
    ) -> list[dict]:
        custs = _read_json(self._customers_file)
        if not include_inactive:
            custs = [
                c for c in custs
                if c.get("status", "active") == "active"
            ]
        return [self._enrich_customer(c) for c in custs]

    def get_customer(self, name) -> dict | None:
        custs = _read_json(self._customers_file)
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() == low:
                return self._enrich_customer(c)
        return None

    def get_budget_summary(self) -> list[dict]:
        custs = self.list_customers(include_inactive=False)
        result = []
        for c in custs:
            budget = c.get("budget", 0)
            rest = c.get("rest", 0)
            percent = (
                int((rest / budget) * 100)
                if budget
                else 0
            )
            result.append({
                "name": c["name"],
                "budget": budget,
                "rest": rest,
                "percent": percent,
                "contracts": c.get("contracts", []),
            })
        return result

    # -- mutations -----------------------------------------------

    def add_customer(
        self,
        name,
        status="active",
        customer_type="",
        budget=0,
        repo=None,
        tags=None,
    ) -> dict:
        custs = _read_json(self._customers_file)
        for c in custs:
            if c.get("name", "").lower() == name.lower():
                raise ValueError(
                    f"Customer already exists: {name}"
                )
        cust = {
            "name": name,
            "status": status,
            "type": customer_type,
            "tags": tags or [],
            "budget": budget,
            "repo": repo or "",
            "used": 0,
            "rest": budget,
            "properties": {},
            "contracts": [],
        }
        custs.append(cust)
        _write_json(self._customers_file, custs)
        return self._enrich_customer(cust)

    def update_customer(
        self, name, updates
    ) -> dict | None:
        custs = _read_json(self._customers_file)
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() == low:
                for key in (
                    "name", "status", "budget", "repo"
                ):
                    if key in updates:
                        c[key] = updates[key]
                _write_json(
                    self._customers_file, custs
                )
                return self._enrich_customer(c)
        return None

    # -- contracts -----------------------------------------------

    def list_contracts(self, name) -> list[dict]:
        custs = _read_json(self._customers_file)
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() == low:
                contracts = c.get("contracts", [])
                return [
                    self._enrich_contract(
                        c["name"], con
                    )
                    for con in contracts
                ]
        return []

    def add_contract(
        self,
        name,
        contract_name,
        budget,
        start_date,
        notes="",
    ) -> dict:
        custs = _read_json(self._customers_file)
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() != low:
                continue
            contracts = c.setdefault("contracts", [])
            for con in contracts:
                if con["name"] == contract_name:
                    raise ValueError(
                        f"Contract already exists: "
                        f"{contract_name}"
                    )
            contract = {
                "name": contract_name,
                "budget": budget,
                "start_date": start_date,
                "end_date": "",
                "notes": notes,
            }
            contracts.append(contract)
            _write_json(self._customers_file, custs)
            return self._enrich_contract(
                c["name"], contract
            )
        raise ValueError(f"Customer not found: {name}")

    def update_contract(
        self, name, contract_name, updates
    ) -> dict | None:
        custs = _read_json(self._customers_file)
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() != low:
                continue
            for con in c.get("contracts", []):
                if con["name"] == contract_name:
                    for key in (
                        "name", "budget",
                        "start_date", "end_date",
                        "notes",
                    ):
                        if key in updates:
                            con[key] = updates[key]
                    _write_json(
                        self._customers_file, custs
                    )
                    return self._enrich_contract(
                        c["name"], con
                    )
            return None
        return None

    def close_contract(
        self, name, contract_name, end_date
    ) -> dict | None:
        return self.update_contract(
            name, contract_name, {"end_date": end_date}
        )

    def delete_contract(
        self, name, contract_name
    ) -> bool:
        custs = _read_json(self._customers_file)
        low = name.lower()
        for c in custs:
            if c.get("name", "").lower() != low:
                continue
            contracts = c.get("contracts", [])
            new = [
                con for con in contracts
                if con["name"] != contract_name
            ]
            if len(new) == len(contracts):
                return False
            c["contracts"] = new
            _write_json(self._customers_file, custs)
            return True
        return False


# ====================================================================
#  NotesBackend
# ====================================================================


class JsonNotesBackend(NotesBackend):
    def __init__(self, notes_file: Path) -> None:
        self._notes_file = notes_file

    @property
    def data_file(self) -> Path:
        return self._notes_file

    def list_notes(self) -> list[dict]:
        return _read_json(self._notes_file)

    def add_note(
        self, title, body="", customer=None,
        tags=None, task_id=None,
    ) -> dict:
        notes = _read_json(self._notes_file)
        note = {
            "id": _generate_id(title),
            "title": title,
            "body": body,
            "customer": customer or "",
            "task_id": task_id or None,
            "tags": tags or [],
            "created": datetime.now().isoformat(),
        }
        notes.append(note)
        _write_json(self._notes_file, notes)
        return note

    def delete_note(self, note_id) -> bool:
        notes = _read_json(self._notes_file)
        new = [
            n for n in notes if n.get("id") != note_id
        ]
        if len(new) == len(notes):
            return False
        _write_json(self._notes_file, new)
        return True

    def update_note(self, note_id, updates) -> dict:
        notes = _read_json(self._notes_file)
        for note in notes:
            if note.get("id") == note_id:
                note.update(updates)
                _write_json(self._notes_file, notes)
                return note
        raise ValueError(f"Note not found: {note_id}")

    def promote_to_task(
        self, note_id, tasks, customer
    ) -> dict:
        notes = _read_json(self._notes_file)
        target = None
        remaining = []
        for note in notes:
            if note.get("id") == note_id:
                target = note
            else:
                remaining.append(note)
        if target is None:
            raise ValueError(
                f"Note not found: {note_id}"
            )
        task = tasks.add_task(
            customer=customer,
            title=target.get("title", ""),
            status="TODO",
            tags=target.get("tags") or None,
            body=target.get("body") or None,
        )
        _write_json(self._notes_file, remaining)
        return task


# ====================================================================
#  Factory
# ====================================================================


def make_json_backend(cfg) -> tuple[
    TaskBackend, ClockBackend, InboxBackend,
    CustomerBackend, NotesBackend, list[Path],
]:
    """Build JSON backends from config paths."""
    md_dir = cfg.MARKDOWN_DIR.expanduser()
    md_dir.mkdir(parents=True, exist_ok=True)

    tasks = JsonTaskBackend(
        md_dir / "tasks.json",
        md_dir / "archive.json",
    )
    clocks = JsonClockBackend(md_dir / "clocks.json")
    inbox = JsonInboxBackend(md_dir / "inbox.json")
    cust = JsonCustomerBackend(
        md_dir / "customers.json",
        md_dir / "clocks.json",
    )
    notes = JsonNotesBackend(md_dir / "notes.json")
    watch_paths = [
        md_dir, cfg.SETTINGS_FILE.expanduser()
    ]
    return tasks, clocks, inbox, cust, notes, watch_paths
