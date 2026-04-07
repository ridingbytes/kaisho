"""SQL backend supporting SQLite (stdlib) and PostgreSQL (psycopg2).

DSN format:
  sqlite:///path/to/kaisho.db
  postgresql://user:pass@host:5432/db

Set BACKEND=sql and SQL_DSN=... in .env to activate.
"""
import hashlib
import json
import re
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


# -- ID generation --------------------------------------------------


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


# -- Period helpers --------------------------------------------------


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


# -- Auto-categorize for inbox --------------------------------------


def _guess_inbox_type(text: str) -> str:
    """Simple heuristic to categorise inbox items."""
    lower = text.lower()
    if any(
        w in lower
        for w in ("bug", "fix", "error", "broken")
    ):
        return "bug"
    if any(
        w in lower
        for w in ("idea", "feature", "request")
    ):
        return "feature"
    if any(
        w in lower
        for w in ("call", "meet", "email", "mail")
    ):
        return "communication"
    return "note"


# -- Row conversion helpers ------------------------------------------


def _row_to_dict_sqlite(row):
    """Convert a sqlite3.Row to a plain dict."""
    return dict(row)


def _row_to_dict_pg(row, description):
    """Convert a psycopg2 tuple row to a dict."""
    cols = [col.name for col in description]
    return dict(zip(cols, row))


def _parse_tags(raw: str | None) -> list[str]:
    """Comma-separated string to list of tags."""
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def _serialize_tags(tags: list[str] | None) -> str:
    """List of tags to comma-separated string."""
    if not tags:
        return ""
    return ",".join(tags)


def _parse_properties(raw: str | None) -> dict:
    """JSON string to dict."""
    if not raw:
        return {}
    return json.loads(raw)


def _serialize_properties(props: dict | None) -> str:
    """Dict to JSON string."""
    if not props:
        return "{}"
    return json.dumps(props, ensure_ascii=False)


# ====================================================================
#  Database wrapper
# ====================================================================


_SQLITE_TABLES = """
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'TODO',
    tags TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    github_url TEXT NOT NULL DEFAULT '',
    properties TEXT NOT NULL DEFAULT '{}',
    created TEXT NOT NULL DEFAULT '',
    archived_at TEXT,
    archive_status TEXT
);

CREATE TABLE IF NOT EXISTS clocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    start TEXT NOT NULL DEFAULT '',
    end TEXT,
    task_id TEXT NOT NULL DEFAULT '',
    contract TEXT NOT NULL DEFAULT '',
    booked INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inbox (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'note',
    customer TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL DEFAULT '',
    properties TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    customer TEXT NOT NULL DEFAULT '',
    task_id TEXT,
    tags TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customers (
    name TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    type TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    budget REAL NOT NULL DEFAULT 0,
    repo TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    properties TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    budget REAL NOT NULL DEFAULT 0,
    used_offset REAL NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);
"""

_PG_TABLES = """
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'TODO',
    tags TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    github_url TEXT NOT NULL DEFAULT '',
    properties TEXT NOT NULL DEFAULT '{}',
    created TEXT NOT NULL DEFAULT '',
    archived_at TEXT,
    archive_status TEXT
);

CREATE TABLE IF NOT EXISTS clocks (
    id SERIAL PRIMARY KEY,
    customer TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    start TEXT NOT NULL DEFAULT '',
    "end" TEXT,
    task_id TEXT NOT NULL DEFAULT '',
    contract TEXT NOT NULL DEFAULT '',
    booked INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inbox (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'note',
    customer TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL DEFAULT '',
    properties TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    customer TEXT NOT NULL DEFAULT '',
    task_id TEXT,
    tags TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customers (
    name TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    type TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    budget REAL NOT NULL DEFAULT 0,
    repo TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    properties TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS contracts (
    id SERIAL PRIMARY KEY,
    customer TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    budget REAL NOT NULL DEFAULT 0,
    used_offset REAL NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);
"""


class _DB:
    """Thin wrapper around DB-API 2.0 connections."""

    def __init__(self, dsn: str):
        self._dsn = dsn
        self._conn = None
        self._is_pg = dsn.startswith("postgresql")
        self._ph = "%s" if self._is_pg else "?"

    def connect(self):
        """Lazily connect and create tables."""
        if self._conn is not None:
            return self._conn
        if self._dsn.startswith("sqlite"):
            import sqlite3
            path = self._dsn.replace("sqlite:///", "")
            Path(path).parent.mkdir(
                parents=True, exist_ok=True
            )
            self._conn = sqlite3.connect(path)
            self._conn.row_factory = sqlite3.Row
        elif self._is_pg:
            import psycopg2
            self._conn = psycopg2.connect(self._dsn)
        else:
            raise ValueError(
                f"Unsupported DSN: {self._dsn}"
            )
        self._create_tables()
        return self._conn

    def _create_tables(self):
        """Run CREATE TABLE IF NOT EXISTS for all tables."""
        conn = self._conn
        cur = conn.cursor()
        ddl = _PG_TABLES if self._is_pg else _SQLITE_TABLES
        for stmt in ddl.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        conn.commit()
        cur.close()

    def ph(self, n=1):
        """Return n parameter placeholders joined by comma."""
        return ", ".join([self._ph] * n)

    def execute(self, sql, params=()):
        """Execute a write query with commit."""
        conn = self.connect()
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        return cur

    def fetchall(self, sql, params=()):
        """Execute a read query and return all rows as dicts."""
        conn = self.connect()
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        if not rows:
            return []
        if self._is_pg:
            desc = cur.description
            return [
                _row_to_dict_pg(r, desc) for r in rows
            ]
        return [_row_to_dict_sqlite(r) for r in rows]

    def fetchone(self, sql, params=()):
        """Execute a read query and return one row as dict."""
        conn = self.connect()
        cur = conn.cursor()
        cur.execute(sql, params)
        row = cur.fetchone()
        if row is None:
            return None
        if self._is_pg:
            return _row_to_dict_pg(row, cur.description)
        return _row_to_dict_sqlite(row)


# ====================================================================
#  TaskBackend
# ====================================================================


class SqlTaskBackend(TaskBackend):
    """TaskBackend backed by a SQL database."""

    def __init__(self, db: _DB):
        self._db = db

    def _row_to_task(self, row: dict) -> dict:
        """Convert a DB row to a task dict."""
        row["tags"] = _parse_tags(row.get("tags"))
        row["properties"] = _parse_properties(
            row.get("properties")
        )
        return row

    def list_tasks(
        self,
        status=None,
        customer=None,
        tag=None,
        include_done=False,
    ) -> list[dict]:
        clauses = []
        params = []
        ph = self._db._ph

        if not include_done:
            clauses.append(
                "(archived_at IS NULL)"
            )
            clauses.append(f"status != {ph}")
            params.append("DONE")

        # Only show non-archived tasks by default
        clauses.append("archived_at IS NULL")

        if status:
            allowed = (
                status if isinstance(status, list)
                else [status]
            )
            placeholders = ", ".join(
                [ph] * len(allowed)
            )
            clauses.append(
                f"status IN ({placeholders})"
            )
            params.extend(allowed)

        if customer:
            clauses.append(f"LOWER(customer) = {ph}")
            params.append(customer.lower())

        where = (
            "WHERE " + " AND ".join(clauses)
            if clauses
            else ""
        )
        sql = f"SELECT * FROM tasks {where}"
        rows = self._db.fetchall(sql, tuple(params))
        tasks = [self._row_to_task(r) for r in rows]

        if tag:
            tasks = [
                t for t in tasks if tag in t.get("tags", [])
            ]
        return tasks

    def list_all_tags(self) -> list[dict]:
        rows = self._db.fetchall(
            "SELECT tags FROM tasks WHERE archived_at IS NULL"
        )
        counter: Counter = Counter()
        for row in rows:
            for tg in _parse_tags(row.get("tags")):
                counter[tg] += 1
        return [
            {"name": name, "count": count}
            for name, count in counter.most_common()
        ]

    def list_archived(self) -> list[dict]:
        rows = self._db.fetchall(
            "SELECT * FROM tasks "
            "WHERE archived_at IS NOT NULL"
        )
        return [self._row_to_task(r) for r in rows]

    def add_task(
        self,
        customer,
        title,
        status="TODO",
        tags=None,
        body=None,
        github_url=None,
    ) -> dict:
        task_id = _generate_id(title)
        now = datetime.now().isoformat()
        self._db.execute(
            f"INSERT INTO tasks "
            f"(id, customer, title, status, tags, body, "
            f"github_url, properties, created) "
            f"VALUES ({self._db.ph(9)})",
            (
                task_id, customer, title, status,
                _serialize_tags(tags),
                body or "",
                github_url or "",
                "{}",
                now,
            ),
        )
        return {
            "id": task_id,
            "customer": customer,
            "title": title,
            "status": status,
            "tags": tags or [],
            "body": body or "",
            "github_url": github_url or "",
            "properties": {},
            "created": now,
        }

    def move_task(self, task_id, new_status) -> dict:
        ph = self._db._ph
        self._db.execute(
            f"UPDATE tasks SET status = {ph} "
            f"WHERE id = {ph}",
            (new_status, task_id),
        )
        row = self._db.fetchone(
            f"SELECT * FROM tasks WHERE id = {ph}",
            (task_id,),
        )
        if row is None:
            raise ValueError(f"Task not found: {task_id}")
        return self._row_to_task(row)

    def set_tags(self, task_id, tags) -> dict:
        ph = self._db._ph
        self._db.execute(
            f"UPDATE tasks SET tags = {ph} "
            f"WHERE id = {ph}",
            (_serialize_tags(list(tags)), task_id),
        )
        row = self._db.fetchone(
            f"SELECT * FROM tasks WHERE id = {ph}",
            (task_id,),
        )
        if row is None:
            raise ValueError(f"Task not found: {task_id}")
        return self._row_to_task(row)

    def update_task(
        self,
        task_id,
        title=None,
        customer=None,
        body=None,
        github_url=None,
    ) -> dict:
        ph = self._db._ph
        sets = []
        params = []
        if title is not None:
            sets.append(f"title = {ph}")
            params.append(title)
        if customer is not None:
            sets.append(f"customer = {ph}")
            params.append(customer)
        if body is not None:
            sets.append(f"body = {ph}")
            params.append(body)
        if github_url is not None:
            sets.append(f"github_url = {ph}")
            params.append(github_url)
        if sets:
            params.append(task_id)
            self._db.execute(
                f"UPDATE tasks SET {', '.join(sets)} "
                f"WHERE id = {ph}",
                tuple(params),
            )
        row = self._db.fetchone(
            f"SELECT * FROM tasks WHERE id = {ph}",
            (task_id,),
        )
        if row is None:
            raise ValueError(f"Task not found: {task_id}")
        return self._row_to_task(row)

    def archive_task(self, task_id) -> bool:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM tasks WHERE id = {ph} "
            f"AND archived_at IS NULL",
            (task_id,),
        )
        if row is None:
            return False
        now = datetime.now().isoformat()
        self._db.execute(
            f"UPDATE tasks SET archived_at = {ph}, "
            f"archive_status = status "
            f"WHERE id = {ph}",
            (now, task_id),
        )
        return True

    def unarchive_task(self, task_id) -> bool:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM tasks WHERE id = {ph} "
            f"AND archived_at IS NOT NULL",
            (task_id,),
        )
        if row is None:
            return False
        self._db.execute(
            f"UPDATE tasks SET archived_at = NULL, "
            f"archive_status = NULL "
            f"WHERE id = {ph}",
            (task_id,),
        )
        return True


# ====================================================================
#  ClockBackend
# ====================================================================


class SqlClockBackend(ClockBackend):
    """ClockBackend backed by a SQL database."""

    def __init__(self, db: _DB):
        self._db = db

    def _duration_minutes(self, entry: dict) -> int:
        """Compute duration in minutes for an entry."""
        start_str = entry.get("start", "")
        end_str = entry.get("end")
        if not start_str:
            return 0
        start = datetime.fromisoformat(start_str)
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
        entry["booked"] = bool(entry.get("booked", 0))
        return entry

    def _entry_in_range(
        self, entry: dict, start: date, end: date
    ) -> bool:
        """Check if a clock entry falls within range."""
        entry_start = entry.get("start", "")
        if not entry_start:
            return False
        entry_date = datetime.fromisoformat(
            entry_start
        ).date()
        return start <= entry_date <= end

    def list_entries(
        self,
        period="today",
        customer=None,
        from_date=None,
        to_date=None,
        task_id=None,
        contract=None,
    ) -> list[dict]:
        ph = self._db._ph

        if task_id:
            rows = self._db.fetchall(
                f"SELECT * FROM clocks "
                f"WHERE task_id = {ph}",
                (task_id,),
            )
        else:
            rows = self._db.fetchall(
                "SELECT * FROM clocks"
            )
            if from_date or to_date:
                sd = from_date or date.min
                ed = to_date or date.max
            else:
                sd, ed = _period_range(period)
            rows = [
                r for r in rows
                if self._entry_in_range(r, sd, ed)
            ]

        if customer:
            low = customer.lower()
            rows = [
                r for r in rows
                if r.get("customer", "").lower() == low
            ]
        if contract:
            rows = [
                r for r in rows
                if r.get("contract") == contract
            ]
        return [self._enrich(r) for r in rows]

    def get_active(self) -> dict | None:
        row = self._db.fetchone(
            "SELECT * FROM clocks "
            "WHERE \"end\" IS NULL"
        )
        if row is None:
            return None
        return self._enrich(row)

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
        now = _local_now().isoformat()
        self._db.execute(
            f"INSERT INTO clocks "
            f"(customer, description, start, task_id, "
            f"contract, booked, notes) "
            f"VALUES ({self._db.ph(7)})",
            (
                customer, description, now,
                task_id or "", contract or "",
                0, "",
            ),
        )
        entry = {
            "customer": customer,
            "description": description,
            "start": now,
            "end": None,
            "task_id": task_id or "",
            "contract": contract or "",
            "booked": False,
            "notes": "",
        }
        return self._enrich(entry)

    def stop(self) -> dict:
        row = self._db.fetchone(
            "SELECT * FROM clocks "
            "WHERE \"end\" IS NULL"
        )
        if row is None:
            raise ValueError("No running clock entry")
        now = _local_now().isoformat()
        ph = self._db._ph
        self._db.execute(
            f"UPDATE clocks SET \"end\" = {ph} "
            f"WHERE id = {ph}",
            (now, row["id"]),
        )
        row["end"] = now
        return self._enrich(row)

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
        self._db.execute(
            f"INSERT INTO clocks "
            f"(customer, description, start, \"end\", "
            f"task_id, contract, booked, notes) "
            f"VALUES ({self._db.ph(8)})",
            (
                customer, description,
                start.isoformat(), end.isoformat(),
                task_id or "", contract or "",
                0, "",
            ),
        )
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
        return self._enrich(entry)

    def update_entry(
        self,
        start_iso,
        customer=None,
        description=None,
        hours=None,
        new_date=None,
        start_time=None,
        task_id=None,
        booked=None,
        notes=None,
        contract=None,
    ) -> dict | None:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM clocks WHERE start = {ph}",
            (start_iso,),
        )
        if row is None:
            return None

        entry = dict(row)
        if customer is not None:
            entry["customer"] = customer
        if description is not None:
            entry["description"] = description
        if task_id is not None:
            entry["task_id"] = task_id
        if booked is not None:
            entry["booked"] = int(booked)
        if notes is not None:
            entry["notes"] = notes
        if contract is not None:
            entry["contract"] = contract

        if start_time is not None:
            old_start = datetime.fromisoformat(
                entry["start"]
            )
            h, m = (
                int(x) for x in start_time.split(":")
            )
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

        self._db.execute(
            f"UPDATE clocks SET "
            f"customer = {ph}, "
            f"description = {ph}, "
            f"start = {ph}, "
            f"\"end\" = {ph}, "
            f"task_id = {ph}, "
            f"contract = {ph}, "
            f"booked = {ph}, "
            f"notes = {ph} "
            f"WHERE id = {ph}",
            (
                entry["customer"],
                entry["description"],
                entry["start"],
                entry.get("end"),
                entry.get("task_id", ""),
                entry.get("contract", ""),
                entry.get("booked", 0),
                entry.get("notes", ""),
                row["id"],
            ),
        )
        return self._enrich(entry)

    def delete_entry(self, start_iso) -> bool:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT id FROM clocks WHERE start = {ph}",
            (start_iso,),
        )
        if row is None:
            return False
        self._db.execute(
            f"DELETE FROM clocks WHERE id = {ph}",
            (row["id"],),
        )
        return True


# ====================================================================
#  InboxBackend
# ====================================================================


class SqlInboxBackend(InboxBackend):
    """InboxBackend backed by a SQL database."""

    def __init__(self, db: _DB):
        self._db = db

    def _row_to_item(self, row: dict) -> dict:
        """Convert a DB row to an inbox item dict."""
        row["properties"] = _parse_properties(
            row.get("properties")
        )
        return row

    def list_items(self) -> list[dict]:
        rows = self._db.fetchall("SELECT * FROM inbox")
        return [self._row_to_item(r) for r in rows]

    def add_item(
        self,
        text,
        item_type=None,
        customer=None,
        body=None,
        channel=None,
        direction=None,
    ) -> dict:
        item_id = _generate_id(text)
        now = datetime.now().isoformat()
        resolved_type = item_type or _guess_inbox_type(text)
        self._db.execute(
            f"INSERT INTO inbox "
            f"(id, type, customer, title, body, "
            f"channel, direction, created, properties) "
            f"VALUES ({self._db.ph(9)})",
            (
                item_id, resolved_type,
                customer or "", text,
                body or "",
                channel or "",
                direction or "",
                now, "{}",
            ),
        )
        return {
            "id": item_id,
            "type": resolved_type,
            "customer": customer or "",
            "title": text,
            "body": body or "",
            "channel": channel or "",
            "direction": direction or "",
            "created": now,
            "properties": {},
        }

    def remove_item(self, item_id) -> bool:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT id FROM inbox WHERE id = {ph}",
            (item_id,),
        )
        if row is None:
            return False
        self._db.execute(
            f"DELETE FROM inbox WHERE id = {ph}",
            (item_id,),
        )
        return True

    def update_item(self, item_id, updates) -> dict:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM inbox WHERE id = {ph}",
            (item_id,),
        )
        if row is None:
            raise ValueError(
                f"Inbox item not found: {item_id}"
            )
        item = self._row_to_item(dict(row))
        allowed = (
            "type", "customer", "title", "body",
            "channel", "direction",
        )
        sets = []
        params = []
        for key in allowed:
            if key in updates:
                sets.append(f"{key} = {ph}")
                params.append(updates[key])
                item[key] = updates[key]
        if "properties" in updates:
            sets.append(f"properties = {ph}")
            serialized = _serialize_properties(
                updates["properties"]
            )
            params.append(serialized)
            item["properties"] = updates["properties"]
        if sets:
            params.append(item_id)
            self._db.execute(
                f"UPDATE inbox SET {', '.join(sets)} "
                f"WHERE id = {ph}",
                tuple(params),
            )
        return item

    def promote_to_task(
        self, item_id, tasks, customer
    ) -> dict:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM inbox WHERE id = {ph}",
            (item_id,),
        )
        if row is None:
            raise ValueError(
                f"Inbox item not found: {item_id}"
            )
        item = self._row_to_item(dict(row))
        task = tasks.add_task(
            customer=customer,
            title=item.get("title", ""),
            status="TODO",
            body=item.get("body") or None,
        )
        self._db.execute(
            f"DELETE FROM inbox WHERE id = {ph}",
            (item_id,),
        )
        return task


# ====================================================================
#  NotesBackend
# ====================================================================


class SqlNotesBackend(NotesBackend):
    """NotesBackend backed by a SQL database."""

    def __init__(self, db: _DB):
        self._db = db

    def _row_to_note(self, row: dict) -> dict:
        """Convert a DB row to a note dict."""
        row["tags"] = _parse_tags(row.get("tags"))
        return row

    def list_notes(self) -> list[dict]:
        rows = self._db.fetchall("SELECT * FROM notes")
        return [self._row_to_note(r) for r in rows]

    def add_note(
        self, title, body="", customer=None,
        tags=None, task_id=None,
    ) -> dict:
        note_id = _generate_id(title)
        now = datetime.now().isoformat()
        self._db.execute(
            f"INSERT INTO notes "
            f"(id, title, body, customer, task_id, "
            f"tags, created) "
            f"VALUES ({self._db.ph(7)})",
            (
                note_id, title, body,
                customer or "",
                task_id,
                _serialize_tags(tags),
                now,
            ),
        )
        return {
            "id": note_id,
            "title": title,
            "body": body,
            "customer": customer or "",
            "task_id": task_id,
            "tags": tags or [],
            "created": now,
        }

    def delete_note(self, note_id) -> bool:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT id FROM notes WHERE id = {ph}",
            (note_id,),
        )
        if row is None:
            return False
        self._db.execute(
            f"DELETE FROM notes WHERE id = {ph}",
            (note_id,),
        )
        return True

    def update_note(self, note_id, updates) -> dict:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM notes WHERE id = {ph}",
            (note_id,),
        )
        if row is None:
            raise ValueError(
                f"Note not found: {note_id}"
            )
        note = self._row_to_note(dict(row))
        allowed = (
            "title", "body", "customer", "task_id",
        )
        sets = []
        params = []
        for key in allowed:
            if key in updates:
                sets.append(f"{key} = {ph}")
                params.append(updates[key])
                note[key] = updates[key]
        if "tags" in updates:
            sets.append(f"tags = {ph}")
            params.append(
                _serialize_tags(updates["tags"])
            )
            note["tags"] = updates["tags"]
        if sets:
            params.append(note_id)
            self._db.execute(
                f"UPDATE notes SET {', '.join(sets)} "
                f"WHERE id = {ph}",
                tuple(params),
            )
        return note

    def promote_to_task(
        self, note_id, tasks, customer
    ) -> dict:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM notes WHERE id = {ph}",
            (note_id,),
        )
        if row is None:
            raise ValueError(
                f"Note not found: {note_id}"
            )
        note = self._row_to_note(dict(row))
        task = tasks.add_task(
            customer=customer,
            title=note.get("title", ""),
            status="TODO",
            tags=note.get("tags") or None,
            body=note.get("body") or None,
        )
        self._db.execute(
            f"DELETE FROM notes WHERE id = {ph}",
            (note_id,),
        )
        return task


# ====================================================================
#  CustomerBackend
# ====================================================================


class SqlCustomerBackend(CustomerBackend):
    """CustomerBackend backed by a SQL database."""

    def __init__(self, db: _DB):
        self._db = db

    def _used_hours(self, customer_name: str) -> float:
        """Sum booked hours from clocks for a customer."""
        total_min = 0
        low = customer_name.lower()
        rows = self._db.fetchall(
            "SELECT customer, start, \"end\" FROM clocks"
        )
        for r in rows:
            if r.get("customer", "").lower() != low:
                continue
            start_str = r.get("start")
            end_str = r.get("end")
            if not start_str or not end_str:
                continue
            start = datetime.fromisoformat(start_str)
            end = datetime.fromisoformat(end_str)
            total_min += max(
                0,
                int(
                    (end - start).total_seconds() / 60
                ),
            )
        return round(total_min / 60, 2)

    def _contract_used_hours(
        self, customer_name: str, contract_name: str
    ) -> float:
        """Sum hours for a specific contract."""
        rows = self._db.fetchall(
            "SELECT customer, contract, start, "
            "\"end\" FROM clocks"
        )
        total_min = 0
        low = customer_name.lower()
        for r in rows:
            if r.get("customer", "").lower() != low:
                continue
            if r.get("contract") != contract_name:
                continue
            start_str = r.get("start")
            end_str = r.get("end")
            if not start_str or not end_str:
                continue
            start = datetime.fromisoformat(start_str)
            end = datetime.fromisoformat(end_str)
            total_min += max(
                0,
                int(
                    (end - start).total_seconds() / 60
                ),
            )
        return round(total_min / 60, 2)

    def _enrich_customer(self, cust: dict) -> dict:
        """Add computed budget fields."""
        cust["tags"] = _parse_tags(cust.get("tags"))
        cust["properties"] = _parse_properties(
            cust.get("properties")
        )
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

    def list_customers(
        self, include_inactive=False
    ) -> list[dict]:
        ph = self._db._ph
        if include_inactive:
            rows = self._db.fetchall(
                "SELECT * FROM customers"
            )
        else:
            rows = self._db.fetchall(
                f"SELECT * FROM customers "
                f"WHERE status = {ph}",
                ("active",),
            )
        return [self._enrich_customer(r) for r in rows]

    def get_customer(self, name) -> dict | None:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM customers "
            f"WHERE LOWER(name) = {ph}",
            (name.lower(),),
        )
        if row is None:
            return None
        return self._enrich_customer(dict(row))

    def get_budget_summary(self) -> list[dict]:
        custs = self.list_customers(
            include_inactive=False
        )
        result = []
        for c in custs:
            budget = c.get("budget", 0)
            rest = c.get("rest", 0)
            percent = (
                int((rest / budget) * 100)
                if budget
                else 0
            )
            contracts = self.list_contracts(c["name"])
            result.append({
                "name": c["name"],
                "budget": budget,
                "rest": rest,
                "percent": percent,
                "contracts": contracts,
            })
        return result

    def add_customer(
        self,
        name,
        status="active",
        customer_type="",
        budget=0,
        color="",
        repo=None,
        tags=None,
    ) -> dict:
        ph = self._db._ph
        existing = self._db.fetchone(
            f"SELECT name FROM customers "
            f"WHERE LOWER(name) = {ph}",
            (name.lower(),),
        )
        if existing is not None:
            raise ValueError(
                f"Customer already exists: {name}"
            )
        self._db.execute(
            f"INSERT INTO customers "
            f"(name, status, type, color, budget, "
            f"repo, tags, properties) "
            f"VALUES ({self._db.ph(8)})",
            (
                name, status, customer_type,
                color, budget,
                repo or "",
                _serialize_tags(tags),
                "{}",
            ),
        )
        return self._enrich_customer({
            "name": name,
            "status": status,
            "type": customer_type,
            "color": color,
            "budget": budget,
            "repo": repo or "",
            "tags": _serialize_tags(tags),
            "properties": "{}",
        })

    def update_customer(
        self, name, updates
    ) -> dict | None:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM customers "
            f"WHERE LOWER(name) = {ph}",
            (name.lower(),),
        )
        if row is None:
            return None
        cust = dict(row)

        sets = []
        params = []
        for key in ("name", "status", "budget", "repo"):
            if key in updates:
                sets.append(f"{key} = {ph}")
                params.append(updates[key])
                cust[key] = updates[key]
        if "color" in updates:
            sets.append(f"color = {ph}")
            params.append(updates["color"])
            cust["color"] = updates["color"]
        if "tags" in updates:
            sets.append(f"tags = {ph}")
            params.append(
                _serialize_tags(updates["tags"])
            )
            cust["tags"] = _serialize_tags(
                updates["tags"]
            )
        if sets:
            params.append(name)
            self._db.execute(
                f"UPDATE customers "
                f"SET {', '.join(sets)} "
                f"WHERE LOWER(name) = LOWER({ph})",
                tuple(params),
            )
        return self._enrich_customer(cust)

    def list_contracts(self, name) -> list[dict]:
        ph = self._db._ph
        rows = self._db.fetchall(
            f"SELECT * FROM contracts "
            f"WHERE LOWER(customer) = {ph}",
            (name.lower(),),
        )
        return [
            self._enrich_contract(name, dict(r))
            for r in rows
        ]

    def add_contract(
        self,
        name,
        contract_name,
        budget,
        start_date,
        notes="",
    ) -> dict:
        ph = self._db._ph
        # Verify customer exists
        cust = self._db.fetchone(
            f"SELECT name FROM customers "
            f"WHERE LOWER(name) = {ph}",
            (name.lower(),),
        )
        if cust is None:
            raise ValueError(
                f"Customer not found: {name}"
            )
        # Check for duplicate contract name
        existing = self._db.fetchone(
            f"SELECT id FROM contracts "
            f"WHERE LOWER(customer) = {ph} "
            f"AND name = {ph}",
            (name.lower(), contract_name),
        )
        if existing is not None:
            raise ValueError(
                f"Contract already exists: "
                f"{contract_name}"
            )
        self._db.execute(
            f"INSERT INTO contracts "
            f"(customer, name, budget, start_date, "
            f"notes) "
            f"VALUES ({self._db.ph(5)})",
            (
                name, contract_name, budget,
                start_date, notes,
            ),
        )
        contract = {
            "name": contract_name,
            "budget": budget,
            "start_date": start_date,
            "end_date": "",
            "notes": notes,
        }
        return self._enrich_contract(name, contract)

    def update_contract(
        self, name, contract_name, updates
    ) -> dict | None:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT * FROM contracts "
            f"WHERE LOWER(customer) = {ph} "
            f"AND name = {ph}",
            (name.lower(), contract_name),
        )
        if row is None:
            return None
        con = dict(row)
        sets = []
        params = []
        for key in (
            "name", "budget", "start_date",
            "end_date", "notes",
        ):
            if key in updates:
                sets.append(f"{key} = {ph}")
                params.append(updates[key])
                con[key] = updates[key]
        if sets:
            params.append(con["id"])
            self._db.execute(
                f"UPDATE contracts "
                f"SET {', '.join(sets)} "
                f"WHERE id = {ph}",
                tuple(params),
            )
        return self._enrich_contract(name, con)

    def close_contract(
        self, name, contract_name, end_date
    ) -> dict | None:
        return self.update_contract(
            name, contract_name, {"end_date": end_date}
        )

    def delete_contract(
        self, name, contract_name
    ) -> bool:
        ph = self._db._ph
        row = self._db.fetchone(
            f"SELECT id FROM contracts "
            f"WHERE LOWER(customer) = {ph} "
            f"AND name = {ph}",
            (name.lower(), contract_name),
        )
        if row is None:
            return False
        self._db.execute(
            f"DELETE FROM contracts WHERE id = {ph}",
            (row["id"],),
        )
        return True


# ====================================================================
#  Factory
# ====================================================================


def make_sql_backend(dsn: str) -> tuple[
    TaskBackend, ClockBackend, InboxBackend,
    CustomerBackend, NotesBackend, list[Path],
]:
    """Create SQL backend instances.

    Returns (tasks, clocks, inbox, customers,
             notes, watch_paths).
    """
    db = _DB(dsn)
    tasks = SqlTaskBackend(db)
    clocks = SqlClockBackend(db)
    inbox = SqlInboxBackend(db)
    customers = SqlCustomerBackend(db)
    notes = SqlNotesBackend(db)
    watch_paths: list[Path] = []
    return (
        tasks, clocks, inbox, customers,
        notes, watch_paths,
    )
