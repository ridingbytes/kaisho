"""SQL backend using SQLAlchemy ORM.

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

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.orm import (
    declarative_base,
    relationship,
    sessionmaker,
)

from ...time_utils import local_now_naive as _local_now
from ..base import (
    ClockBackend,
    CustomerBackend,
    InboxBackend,
    NotesBackend,
    TaskBackend,
)


# -- SQLAlchemy models -----------------------------------------------

Base = declarative_base()


class TaskRow(Base):
    __tablename__ = "tasks"
    id = Column(String, primary_key=True)
    customer = Column(String, default="")
    title = Column(String, nullable=False)
    status = Column(String, default="TODO")
    tags = Column(String, default="")
    body = Column(Text, default="")
    github_url = Column(String, default="")
    properties = Column(Text, default="{}")
    created = Column(String, nullable=False)
    archived_at = Column(String, nullable=True)
    archive_status = Column(String, nullable=True)


class ClockRow(Base):
    __tablename__ = "clocks"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )
    customer = Column(String, nullable=False)
    description = Column(String, default="")
    start = Column(String, nullable=False)
    end = Column(String, nullable=True)
    task_id = Column(String, nullable=True)
    contract = Column(String, nullable=True)
    booked = Column(Boolean, default=False)
    notes = Column(Text, default="")


class InboxRow(Base):
    __tablename__ = "inbox"
    id = Column(String, primary_key=True)
    type = Column(String, default="")
    customer = Column(String, default="")
    title = Column(String, nullable=False)
    body = Column(Text, default="")
    channel = Column(String, default="")
    direction = Column(String, default="")
    created = Column(String, nullable=False)
    properties = Column(Text, default="{}")


class NoteRow(Base):
    __tablename__ = "notes"
    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    body = Column(Text, default="")
    customer = Column(String, default="")
    task_id = Column(String, nullable=True)
    tags = Column(String, default="")
    created = Column(String, nullable=False)


class CustomerRow(Base):
    __tablename__ = "customers"
    name = Column(String, primary_key=True)
    status = Column(String, default="active")
    type = Column(String, default="")
    color = Column(String, default="")
    budget = Column(Float, default=0)
    repo = Column(String, default="")
    tags = Column(String, default="")
    properties = Column(Text, default="{}")
    contracts = relationship(
        "ContractRow", back_populates="customer_rel"
    )


class ContractRow(Base):
    __tablename__ = "contracts"
    id = Column(
        Integer, primary_key=True, autoincrement=True
    )
    customer = Column(
        String,
        ForeignKey("customers.name"),
        nullable=False,
    )
    name = Column(String, nullable=False)
    budget = Column(Float, default=0)
    used_offset = Column(Float, default=0)
    start_date = Column(String, default="")
    end_date = Column(String, default="")
    notes = Column(Text, default="")
    customer_rel = relationship(
        "CustomerRow", back_populates="contracts"
    )


# -- Engine wrapper --------------------------------------------------


class _Engine:
    """Wraps SQLAlchemy engine and session factory."""

    def __init__(self, dsn: str):
        if dsn.startswith("sqlite"):
            path = dsn.replace("sqlite:///", "")
            Path(path).parent.mkdir(
                parents=True, exist_ok=True
            )
        self.engine = create_engine(dsn)
        Base.metadata.create_all(self.engine)
        self._Session = sessionmaker(bind=self.engine)

    def session(self):
        return self._Session()


# -- ID generation ---------------------------------------------------


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


# -- Auto-categorize for inbox ---------------------------------------


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


# -- Serialization helpers -------------------------------------------


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


# -- Row-to-dict converters ------------------------------------------


def _task_row_to_dict(row: TaskRow) -> dict:
    """Convert a TaskRow ORM object to a plain dict."""
    return {
        "id": row.id,
        "customer": row.customer or "",
        "title": row.title,
        "status": row.status or "TODO",
        "tags": _parse_tags(row.tags),
        "body": row.body or "",
        "github_url": row.github_url or "",
        "properties": _parse_properties(row.properties),
        "created": row.created,
        "archived_at": row.archived_at,
        "archive_status": row.archive_status,
    }


def _clock_row_to_dict(row: ClockRow) -> dict:
    """Convert a ClockRow ORM object to a plain dict."""
    return {
        "id": row.id,
        "customer": row.customer or "",
        "description": row.description or "",
        "start": row.start,
        "end": row.end,
        "task_id": row.task_id or "",
        "contract": row.contract or "",
        "booked": bool(row.booked),
        "notes": row.notes or "",
    }


def _inbox_row_to_dict(row: InboxRow) -> dict:
    """Convert an InboxRow ORM object to a plain dict."""
    return {
        "id": row.id,
        "type": row.type or "",
        "customer": row.customer or "",
        "title": row.title,
        "body": row.body or "",
        "channel": row.channel or "",
        "direction": row.direction or "",
        "created": row.created,
        "properties": _parse_properties(row.properties),
    }


def _note_row_to_dict(row: NoteRow) -> dict:
    """Convert a NoteRow ORM object to a plain dict."""
    return {
        "id": row.id,
        "title": row.title,
        "body": row.body or "",
        "customer": row.customer or "",
        "task_id": row.task_id,
        "tags": _parse_tags(row.tags),
        "created": row.created,
    }


def _customer_row_to_dict(row: CustomerRow) -> dict:
    """Convert a CustomerRow ORM object to a dict.

    Does NOT include computed budget fields (used/rest).
    """
    return {
        "name": row.name,
        "status": row.status or "active",
        "type": row.type or "",
        "color": row.color or "",
        "budget": row.budget or 0,
        "repo": row.repo or "",
        "tags": _parse_tags(row.tags),
        "properties": _parse_properties(row.properties),
    }


def _contract_row_to_dict(row: ContractRow) -> dict:
    """Convert a ContractRow ORM object to a dict.

    Does NOT include computed used/rest fields.
    """
    return {
        "id": row.id,
        "customer": row.customer,
        "name": row.name,
        "budget": row.budget or 0,
        "used_offset": row.used_offset or 0,
        "start_date": row.start_date or "",
        "end_date": row.end_date or "",
        "notes": row.notes or "",
    }


# -- Clock duration helpers ------------------------------------------


def _compute_duration_minutes(
    start_str: str, end_str: str | None
) -> int:
    """Compute duration in minutes between two ISO stamps."""
    if not start_str:
        return 0
    start = datetime.fromisoformat(start_str)
    if not end_str:
        end = _local_now()
    else:
        end = datetime.fromisoformat(end_str)
    return max(0, int((end - start).total_seconds() / 60))


def _enrich_clock(entry: dict) -> dict:
    """Add computed duration_minutes field."""
    entry["duration_minutes"] = _compute_duration_minutes(
        entry.get("start", ""), entry.get("end")
    )
    return entry


def _entry_in_range(
    entry: dict, start: date, end: date
) -> bool:
    """Check if a clock entry falls within date range."""
    entry_start = entry.get("start", "")
    if not entry_start:
        return False
    entry_date = datetime.fromisoformat(
        entry_start
    ).date()
    return start <= entry_date <= end


# ====================================================================
#  TaskBackend
# ====================================================================


class SqlTaskBackend(TaskBackend):
    """TaskBackend backed by SQLAlchemy ORM."""

    def __init__(self, eng: _Engine):
        self._eng = eng

    def list_tasks(
        self,
        status=None,
        customer=None,
        tag=None,
        include_done=False,
    ) -> list[dict]:
        session = self._eng.session()
        try:
            q = session.query(TaskRow).filter(
                TaskRow.archived_at.is_(None)
            )
            if not include_done:
                q = q.filter(TaskRow.status != "DONE")
            if status:
                allowed = (
                    status
                    if isinstance(status, list)
                    else [status]
                )
                q = q.filter(TaskRow.status.in_(allowed))
            if customer:
                q = q.filter(
                    func.lower(TaskRow.customer)
                    == customer.lower()
                )
            tasks = [_task_row_to_dict(r) for r in q.all()]
            if tag:
                tasks = [
                    t
                    for t in tasks
                    if tag in t.get("tags", [])
                ]
            return tasks
        finally:
            session.close()

    def list_all_tags(self) -> list[dict]:
        session = self._eng.session()
        try:
            rows = (
                session.query(TaskRow.tags)
                .filter(TaskRow.archived_at.is_(None))
                .all()
            )
            counter: Counter = Counter()
            for (raw_tags,) in rows:
                for tg in _parse_tags(raw_tags):
                    counter[tg] += 1
            return [
                {"name": name, "count": count}
                for name, count in counter.most_common()
            ]
        finally:
            session.close()

    def list_archived(self) -> list[dict]:
        session = self._eng.session()
        try:
            rows = (
                session.query(TaskRow)
                .filter(TaskRow.archived_at.isnot(None))
                .all()
            )
            return [_task_row_to_dict(r) for r in rows]
        finally:
            session.close()

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
        row = TaskRow(
            id=task_id,
            customer=customer,
            title=title,
            status=status,
            tags=_serialize_tags(tags),
            body=body or "",
            github_url=github_url or "",
            properties="{}",
            created=now,
        )
        session = self._eng.session()
        try:
            session.add(row)
            session.commit()
        finally:
            session.close()
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
        session = self._eng.session()
        try:
            row = session.get(TaskRow, task_id)
            if row is None:
                raise ValueError(
                    f"Task not found: {task_id}"
                )
            row.status = new_status
            session.commit()
            result = _task_row_to_dict(row)
        finally:
            session.close()
        return result

    def set_tags(self, task_id, tags) -> dict:
        session = self._eng.session()
        try:
            row = session.get(TaskRow, task_id)
            if row is None:
                raise ValueError(
                    f"Task not found: {task_id}"
                )
            row.tags = _serialize_tags(list(tags))
            session.commit()
            result = _task_row_to_dict(row)
        finally:
            session.close()
        return result

    def update_task(
        self,
        task_id,
        title=None,
        customer=None,
        body=None,
        github_url=None,
    ) -> dict:
        session = self._eng.session()
        try:
            row = session.get(TaskRow, task_id)
            if row is None:
                raise ValueError(
                    f"Task not found: {task_id}"
                )
            if title is not None:
                row.title = title
            if customer is not None:
                row.customer = customer
            if body is not None:
                row.body = body
            if github_url is not None:
                row.github_url = github_url
            session.commit()
            result = _task_row_to_dict(row)
        finally:
            session.close()
        return result

    def archive_task(self, task_id) -> bool:
        session = self._eng.session()
        try:
            row = (
                session.query(TaskRow)
                .filter(
                    TaskRow.id == task_id,
                    TaskRow.archived_at.is_(None),
                )
                .first()
            )
            if row is None:
                return False
            now = datetime.now().isoformat()
            row.archived_at = now
            row.archive_status = row.status
            session.commit()
            return True
        finally:
            session.close()

    def unarchive_task(self, task_id) -> bool:
        session = self._eng.session()
        try:
            row = (
                session.query(TaskRow)
                .filter(
                    TaskRow.id == task_id,
                    TaskRow.archived_at.isnot(None),
                )
                .first()
            )
            if row is None:
                return False
            row.archived_at = None
            row.archive_status = None
            session.commit()
            return True
        finally:
            session.close()


# ====================================================================
#  ClockBackend
# ====================================================================


class SqlClockBackend(ClockBackend):
    """ClockBackend backed by SQLAlchemy ORM."""

    def __init__(self, eng: _Engine):
        self._eng = eng

    def list_entries(
        self,
        period="today",
        customer=None,
        from_date=None,
        to_date=None,
        task_id=None,
        contract=None,
    ) -> list[dict]:
        session = self._eng.session()
        try:
            q = session.query(ClockRow)
            if task_id:
                q = q.filter(ClockRow.task_id == task_id)
                entries = [
                    _clock_row_to_dict(r) for r in q.all()
                ]
            else:
                entries = [
                    _clock_row_to_dict(r) for r in q.all()
                ]
                if from_date or to_date:
                    sd = from_date or date.min
                    ed = to_date or date.max
                else:
                    sd, ed = _period_range(period)
                entries = [
                    e
                    for e in entries
                    if _entry_in_range(e, sd, ed)
                ]
            if customer:
                low = customer.lower()
                entries = [
                    e
                    for e in entries
                    if e.get("customer", "").lower()
                    == low
                ]
            if contract:
                entries = [
                    e
                    for e in entries
                    if e.get("contract") == contract
                ]
            return [_enrich_clock(e) for e in entries]
        finally:
            session.close()

    def get_active(self) -> dict | None:
        session = self._eng.session()
        try:
            row = (
                session.query(ClockRow)
                .filter(ClockRow.end.is_(None))
                .first()
            )
            if row is None:
                return None
            return _enrich_clock(_clock_row_to_dict(row))
        finally:
            session.close()

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
        row = ClockRow(
            customer=customer,
            description=description,
            start=now,
            end=None,
            task_id=task_id or "",
            contract=contract or "",
            booked=False,
            notes="",
        )
        session = self._eng.session()
        try:
            session.add(row)
            session.commit()
        finally:
            session.close()
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
        return _enrich_clock(entry)

    def stop(self) -> dict:
        session = self._eng.session()
        try:
            row = (
                session.query(ClockRow)
                .filter(ClockRow.end.is_(None))
                .first()
            )
            if row is None:
                raise ValueError("No running clock entry")
            now = _local_now().isoformat()
            row.end = now
            session.commit()
            entry = _clock_row_to_dict(row)
        finally:
            session.close()
        return _enrich_clock(entry)

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
                target_date.year,
                target_date.month,
                target_date.day,
                12, 0, 0,
            )
            end = start + timedelta(minutes=minutes)
        else:
            end = _local_now().replace(
                second=0, microsecond=0
            )
            start = end - timedelta(minutes=minutes)
            if start.date() < end.date():
                start = end.replace(hour=0, minute=0)
        row = ClockRow(
            customer=customer,
            description=description,
            start=start.isoformat(),
            end=end.isoformat(),
            task_id=task_id or "",
            contract=contract or "",
            booked=False,
            notes="",
        )
        session = self._eng.session()
        try:
            session.add(row)
            session.commit()
        finally:
            session.close()
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
        return _enrich_clock(entry)

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
        session = self._eng.session()
        try:
            row = (
                session.query(ClockRow)
                .filter(ClockRow.start == start_iso)
                .first()
            )
            if row is None:
                return None

            if customer is not None:
                row.customer = customer
            if description is not None:
                row.description = description
            if task_id is not None:
                row.task_id = task_id
            if booked is not None:
                row.booked = booked
            if notes is not None:
                row.notes = notes
            if contract is not None:
                row.contract = contract

            if start_time is not None:
                old_start = datetime.fromisoformat(
                    row.start
                )
                h, m = (
                    int(x)
                    for x in start_time.split(":")
                )
                new_start = old_start.replace(
                    hour=h, minute=m
                )
                delta = new_start - old_start
                row.start = new_start.isoformat()
                if row.end:
                    old_end = datetime.fromisoformat(
                        row.end
                    )
                    row.end = (
                        old_end + delta
                    ).isoformat()

            if hours is not None:
                start_dt = datetime.fromisoformat(
                    row.start
                )
                row.end = (
                    start_dt + timedelta(hours=hours)
                ).isoformat()

            if new_date is not None:
                old_start = datetime.fromisoformat(
                    row.start
                )
                new_start = old_start.replace(
                    year=new_date.year,
                    month=new_date.month,
                    day=new_date.day,
                )
                delta = new_start - old_start
                row.start = new_start.isoformat()
                if row.end:
                    old_end = datetime.fromisoformat(
                        row.end
                    )
                    row.end = (
                        old_end + delta
                    ).isoformat()

            session.commit()
            result = _clock_row_to_dict(row)
        finally:
            session.close()
        return _enrich_clock(result)

    def delete_entry(self, start_iso) -> bool:
        session = self._eng.session()
        try:
            row = (
                session.query(ClockRow)
                .filter(ClockRow.start == start_iso)
                .first()
            )
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True
        finally:
            session.close()


# ====================================================================
#  InboxBackend
# ====================================================================


class SqlInboxBackend(InboxBackend):
    """InboxBackend backed by SQLAlchemy ORM."""

    def __init__(self, eng: _Engine):
        self._eng = eng

    def list_items(self) -> list[dict]:
        session = self._eng.session()
        try:
            rows = session.query(InboxRow).all()
            return [_inbox_row_to_dict(r) for r in rows]
        finally:
            session.close()

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
        resolved_type = (
            item_type or _guess_inbox_type(text)
        )
        row = InboxRow(
            id=item_id,
            type=resolved_type,
            customer=customer or "",
            title=text,
            body=body or "",
            channel=channel or "",
            direction=direction or "",
            created=now,
            properties="{}",
        )
        session = self._eng.session()
        try:
            session.add(row)
            session.commit()
        finally:
            session.close()
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
        session = self._eng.session()
        try:
            row = session.get(InboxRow, item_id)
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True
        finally:
            session.close()

    def update_item(self, item_id, updates) -> dict:
        session = self._eng.session()
        try:
            row = session.get(InboxRow, item_id)
            if row is None:
                raise ValueError(
                    f"Inbox item not found: {item_id}"
                )
            allowed = (
                "type", "customer", "title", "body",
                "channel", "direction",
            )
            for key in allowed:
                if key in updates:
                    setattr(row, key, updates[key])
            if "properties" in updates:
                row.properties = _serialize_properties(
                    updates["properties"]
                )
            session.commit()
            result = _inbox_row_to_dict(row)
        finally:
            session.close()
        return result

    def promote_to_task(
        self, item_id, tasks, customer
    ) -> dict:
        session = self._eng.session()
        try:
            row = session.get(InboxRow, item_id)
            if row is None:
                raise ValueError(
                    f"Inbox item not found: {item_id}"
                )
            item = _inbox_row_to_dict(row)
            task = tasks.add_task(
                customer=customer,
                title=item.get("title", ""),
                status="TODO",
                body=item.get("body") or None,
            )
            session.delete(row)
            session.commit()
        finally:
            session.close()
        return task


# ====================================================================
#  NotesBackend
# ====================================================================


class SqlNotesBackend(NotesBackend):
    """NotesBackend backed by SQLAlchemy ORM."""

    def __init__(self, eng: _Engine):
        self._eng = eng

    def list_notes(self) -> list[dict]:
        session = self._eng.session()
        try:
            rows = session.query(NoteRow).all()
            return [_note_row_to_dict(r) for r in rows]
        finally:
            session.close()

    def add_note(
        self,
        title,
        body="",
        customer=None,
        tags=None,
        task_id=None,
    ) -> dict:
        note_id = _generate_id(title)
        now = datetime.now().isoformat()
        row = NoteRow(
            id=note_id,
            title=title,
            body=body,
            customer=customer or "",
            task_id=task_id,
            tags=_serialize_tags(tags),
            created=now,
        )
        session = self._eng.session()
        try:
            session.add(row)
            session.commit()
        finally:
            session.close()
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
        session = self._eng.session()
        try:
            row = session.get(NoteRow, note_id)
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True
        finally:
            session.close()

    def update_note(self, note_id, updates) -> dict:
        session = self._eng.session()
        try:
            row = session.get(NoteRow, note_id)
            if row is None:
                raise ValueError(
                    f"Note not found: {note_id}"
                )
            allowed = (
                "title", "body", "customer", "task_id",
            )
            for key in allowed:
                if key in updates:
                    setattr(row, key, updates[key])
            if "tags" in updates:
                row.tags = _serialize_tags(
                    updates["tags"]
                )
            session.commit()
            result = _note_row_to_dict(row)
        finally:
            session.close()
        return result

    def promote_to_task(
        self, note_id, tasks, customer
    ) -> dict:
        session = self._eng.session()
        try:
            row = session.get(NoteRow, note_id)
            if row is None:
                raise ValueError(
                    f"Note not found: {note_id}"
                )
            note = _note_row_to_dict(row)
            task = tasks.add_task(
                customer=customer,
                title=note.get("title", ""),
                status="TODO",
                tags=note.get("tags") or None,
                body=note.get("body") or None,
            )
            session.delete(row)
            session.commit()
        finally:
            session.close()
        return task


# ====================================================================
#  CustomerBackend
# ====================================================================


class SqlCustomerBackend(CustomerBackend):
    """CustomerBackend backed by SQLAlchemy ORM."""

    def __init__(self, eng: _Engine):
        self._eng = eng

    def _used_hours(self, customer_name: str) -> float:
        """Sum booked hours from clocks for a customer."""
        session = self._eng.session()
        try:
            rows = session.query(
                ClockRow.start, ClockRow.end
            ).filter(
                func.lower(ClockRow.customer)
                == customer_name.lower()
            ).all()
            total_min = 0
            for start_str, end_str in rows:
                if not start_str or not end_str:
                    continue
                start = datetime.fromisoformat(start_str)
                end = datetime.fromisoformat(end_str)
                total_min += max(
                    0,
                    int(
                        (end - start).total_seconds()
                        / 60
                    ),
                )
            return round(total_min / 60, 2)
        finally:
            session.close()

    def _contract_used_hours(
        self, customer_name: str, contract_name: str
    ) -> float:
        """Sum hours for a specific contract."""
        session = self._eng.session()
        try:
            rows = session.query(
                ClockRow.start, ClockRow.end
            ).filter(
                func.lower(ClockRow.customer)
                == customer_name.lower(),
                ClockRow.contract == contract_name,
            ).all()
            total_min = 0
            for start_str, end_str in rows:
                if not start_str or not end_str:
                    continue
                start = datetime.fromisoformat(start_str)
                end = datetime.fromisoformat(end_str)
                total_min += max(
                    0,
                    int(
                        (end - start).total_seconds()
                        / 60
                    ),
                )
            return round(total_min / 60, 2)
        finally:
            session.close()

    def _enrich_customer(self, cust: dict) -> dict:
        """Add computed budget fields (used/rest)."""
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
        session = self._eng.session()
        try:
            q = session.query(CustomerRow)
            if not include_inactive:
                q = q.filter(
                    CustomerRow.status == "active"
                )
            rows = q.all()
            customers = [
                _customer_row_to_dict(r) for r in rows
            ]
        finally:
            session.close()
        return [
            self._enrich_customer(c) for c in customers
        ]

    def get_customer(self, name) -> dict | None:
        session = self._eng.session()
        try:
            row = (
                session.query(CustomerRow)
                .filter(
                    func.lower(CustomerRow.name)
                    == name.lower()
                )
                .first()
            )
            if row is None:
                return None
            cust = _customer_row_to_dict(row)
        finally:
            session.close()
        return self._enrich_customer(cust)

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
        session = self._eng.session()
        try:
            existing = (
                session.query(CustomerRow)
                .filter(
                    func.lower(CustomerRow.name)
                    == name.lower()
                )
                .first()
            )
            if existing is not None:
                raise ValueError(
                    f"Customer already exists: {name}"
                )
            row = CustomerRow(
                name=name,
                status=status,
                type=customer_type,
                color=color,
                budget=budget,
                repo=repo or "",
                tags=_serialize_tags(tags),
                properties="{}",
            )
            session.add(row)
            session.commit()
            cust = _customer_row_to_dict(row)
        finally:
            session.close()
        return self._enrich_customer(cust)

    def update_customer(
        self, name, updates
    ) -> dict | None:
        session = self._eng.session()
        try:
            row = (
                session.query(CustomerRow)
                .filter(
                    func.lower(CustomerRow.name)
                    == name.lower()
                )
                .first()
            )
            if row is None:
                return None
            for key in (
                "name", "status", "budget", "repo",
            ):
                if key in updates:
                    setattr(row, key, updates[key])
            if "color" in updates:
                row.color = updates["color"]
            if "tags" in updates:
                row.tags = _serialize_tags(
                    updates["tags"]
                )
            session.commit()
            cust = _customer_row_to_dict(row)
        finally:
            session.close()
        return self._enrich_customer(cust)

    def list_contracts(self, name) -> list[dict]:
        session = self._eng.session()
        try:
            rows = (
                session.query(ContractRow)
                .filter(
                    func.lower(ContractRow.customer)
                    == name.lower()
                )
                .all()
            )
            contracts = [
                _contract_row_to_dict(r) for r in rows
            ]
        finally:
            session.close()
        return [
            self._enrich_contract(name, c)
            for c in contracts
        ]

    def add_contract(
        self,
        name,
        contract_name,
        budget,
        start_date,
        notes="",
    ) -> dict:
        session = self._eng.session()
        try:
            cust = (
                session.query(CustomerRow)
                .filter(
                    func.lower(CustomerRow.name)
                    == name.lower()
                )
                .first()
            )
            if cust is None:
                raise ValueError(
                    f"Customer not found: {name}"
                )
            existing = (
                session.query(ContractRow)
                .filter(
                    func.lower(ContractRow.customer)
                    == name.lower(),
                    ContractRow.name == contract_name,
                )
                .first()
            )
            if existing is not None:
                raise ValueError(
                    f"Contract already exists: "
                    f"{contract_name}"
                )
            row = ContractRow(
                customer=name,
                name=contract_name,
                budget=budget,
                start_date=start_date,
                notes=notes,
            )
            session.add(row)
            session.commit()
            con = _contract_row_to_dict(row)
        finally:
            session.close()
        return self._enrich_contract(name, con)

    def update_contract(
        self, name, contract_name, updates
    ) -> dict | None:
        session = self._eng.session()
        try:
            row = (
                session.query(ContractRow)
                .filter(
                    func.lower(ContractRow.customer)
                    == name.lower(),
                    ContractRow.name == contract_name,
                )
                .first()
            )
            if row is None:
                return None
            for key in (
                "name", "budget", "start_date",
                "end_date", "notes",
            ):
                if key in updates:
                    setattr(row, key, updates[key])
            session.commit()
            con = _contract_row_to_dict(row)
        finally:
            session.close()
        return self._enrich_contract(name, con)

    def close_contract(
        self, name, contract_name, end_date
    ) -> dict | None:
        return self.update_contract(
            name, contract_name,
            {"end_date": end_date},
        )

    def delete_contract(
        self, name, contract_name
    ) -> bool:
        session = self._eng.session()
        try:
            row = (
                session.query(ContractRow)
                .filter(
                    func.lower(ContractRow.customer)
                    == name.lower(),
                    ContractRow.name == contract_name,
                )
                .first()
            )
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True
        finally:
            session.close()


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
    eng = _Engine(dsn)
    tasks = SqlTaskBackend(eng)
    clocks = SqlClockBackend(eng)
    inbox = SqlInboxBackend(eng)
    customers = SqlCustomerBackend(eng)
    notes = SqlNotesBackend(eng)
    watch_paths: list[Path] = []
    return (
        tasks, clocks, inbox, customers,
        notes, watch_paths,
    )
