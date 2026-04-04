"""SQLite database initialisation and connection helper.

All tables are created here on first use. Each service module
imports get_db_conn() to acquire a connection.
"""
import sqlite3
from pathlib import Path


_SCHEMA = """
CREATE TABLE IF NOT EXISTS communications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT    NOT NULL,       -- ISO-8601 timestamp
    customer    TEXT,
    direction   TEXT    NOT NULL,       -- 'in' | 'out'
    channel     TEXT    NOT NULL,       -- 'email' | 'phone' | 'chat' | 'other'
    subject     TEXT    NOT NULL,
    body        TEXT    DEFAULT '',
    contact     TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cron_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT    NOT NULL,
    started_at  TEXT    NOT NULL,       -- ISO-8601
    finished_at TEXT,
    status      TEXT    NOT NULL,       -- 'running' | 'ok' | 'error'
    output      TEXT    DEFAULT '',
    error       TEXT    DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_comm_customer
    ON communications (customer);
CREATE INDEX IF NOT EXISTS idx_comm_ts
    ON communications (ts DESC);
CREATE INDEX IF NOT EXISTS idx_cron_job
    ON cron_history (job_id);
CREATE INDEX IF NOT EXISTS idx_cron_started
    ON cron_history (started_at DESC);
"""


def init_db(db_file: Path) -> None:
    """Create all tables if they do not exist."""
    db_file.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_file) as conn:
        conn.executescript(_SCHEMA)


def get_db_conn(db_file: Path) -> sqlite3.Connection:
    """Return an open connection with row_factory set to Row."""
    init_db(db_file)
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn
