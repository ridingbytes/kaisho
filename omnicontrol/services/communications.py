"""Communications log service.

Stores inbound/outbound communication history in SQLite.
All write operations go through this service; the API and CLI
are thin callers.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

from .database import get_db_conn

CHANNELS = {"email", "phone", "chat", "other"}
DIRECTIONS = {"in", "out"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _row_to_dict(row) -> dict:
    d = dict(row)
    raw = d.get("tags", "[]") or "[]"
    try:
        d["tags"] = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        d["tags"] = []
    d.setdefault("type", "")
    return d


def log_comm(
    db_file: Path,
    subject: str,
    direction: str,
    channel: str,
    customer: str | None = None,
    body: str = "",
    contact: str = "",
    ts: str | None = None,
    comm_type: str = "",
    tags: list[str] | None = None,
) -> dict:
    """Add a communication entry. Returns the created record."""
    if direction not in DIRECTIONS:
        raise ValueError(
            f"direction must be one of {sorted(DIRECTIONS)}"
        )
    if channel not in CHANNELS:
        raise ValueError(
            f"channel must be one of {sorted(CHANNELS)}"
        )
    ts = ts or _now_iso()
    tags_json = json.dumps(tags or [])
    with get_db_conn(db_file) as conn:
        cursor = conn.execute(
            """
            INSERT INTO communications
                (ts, customer, direction, channel, subject,
                 body, contact, type, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (ts, customer, direction, channel, subject,
             body, contact, comm_type, tags_json),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM communications WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return _row_to_dict(row)


def update_comm(
    db_file: Path,
    comm_id: int,
    updates: dict,
) -> dict | None:
    """Update fields of a communication entry. Returns None if not found."""
    allowed = {"subject", "body", "contact", "type", "tags", "customer"}
    fields = {k: v for k, v in updates.items() if k in allowed}
    if not fields:
        return get_comm(db_file, comm_id)
    if "tags" in fields:
        fields["tags"] = json.dumps(fields["tags"])
    assignments = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [comm_id]
    with get_db_conn(db_file) as conn:
        conn.execute(
            f"UPDATE communications SET {assignments} WHERE id = ?",
            values,
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM communications WHERE id = ?",
            (comm_id,),
        ).fetchone()
    return _row_to_dict(row) if row else None


def list_comms(
    db_file: Path,
    customer: str | None = None,
    channel: str | None = None,
    direction: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """List communication entries, most recent first."""
    clauses = []
    params: list = []
    if customer:
        clauses.append("customer = ?")
        params.append(customer)
    if channel:
        clauses.append("channel = ?")
        params.append(channel)
    if direction:
        clauses.append("direction = ?")
        params.append(direction)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with get_db_conn(db_file) as conn:
        rows = conn.execute(
            f"SELECT * FROM communications {where} "
            f"ORDER BY ts DESC LIMIT ?",
            [*params, limit],
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def search_comms(
    db_file: Path,
    query: str,
    limit: int = 50,
) -> list[dict]:
    """Search subject and body for query text."""
    pattern = f"%{query}%"
    with get_db_conn(db_file) as conn:
        rows = conn.execute(
            """
            SELECT * FROM communications
            WHERE subject LIKE ? OR body LIKE ?
            ORDER BY ts DESC LIMIT ?
            """,
            (pattern, pattern, limit),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_comm(db_file: Path, comm_id: int) -> dict | None:
    """Return a single communication record by id."""
    with get_db_conn(db_file) as conn:
        row = conn.execute(
            "SELECT * FROM communications WHERE id = ?",
            (comm_id,),
        ).fetchone()
    return _row_to_dict(row) if row else None


def delete_comm(db_file: Path, comm_id: int) -> bool:
    """Delete a communication record. Returns False if not found."""
    with get_db_conn(db_file) as conn:
        cursor = conn.execute(
            "DELETE FROM communications WHERE id = ?", (comm_id,)
        )
        conn.commit()
    return cursor.rowcount > 0
