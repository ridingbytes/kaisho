"""Cloud sync state: cursor + tombstones on disk.

State lives under ``<profile>/sync/``:

- ``cursor.json`` — pull/push cursors and last-sync metadata
  used by the bidirectional sync cycle.
- ``tombstones.json`` — entries deleted locally that still
  need to be pushed up. Each record carries the full
  payload so ``POST /sync/apply`` can accept it even if
  the cloud has never seen the id before.

Both files are written atomically via a tmp + replace
dance so a crash mid-write cannot leave corrupt JSON on
disk.
"""
import json
import tempfile
from pathlib import Path

EPOCH = "1970-01-01T00:00:00Z"


# ── Paths ─────────────────────────────────────────────

def sync_dir(profile_dir: Path) -> Path:
    """Return the sync state directory for a profile."""
    return profile_dir / "sync"


def cursor_path(profile_dir: Path) -> Path:
    return sync_dir(profile_dir) / "cursor.json"


def tombstones_path(profile_dir: Path) -> Path:
    return sync_dir(profile_dir) / "tombstones.json"


# ── Atomic JSON I/O ───────────────────────────────────

def _atomic_write_json(path: Path, data: dict) -> None:
    """Write JSON atomically (tmp + rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        dir=path.parent, suffix=".tmp",
    )
    try:
        with open(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        Path(tmp).replace(path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _read_json(path: Path, default: dict) -> dict:
    """Read JSON or return ``default`` on any error."""
    if not path.exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


# ── Cursor ────────────────────────────────────────────

DEFAULT_CURSOR: dict = {
    "last_pull_cursor": EPOCH,
    "last_push_cursor": EPOCH,
    "last_pull_at": None,
    "last_push_at": None,
    "last_error": None,
    "last_snapshot_push": None,
}


def load_cursor(profile_dir: Path) -> dict:
    """Load the sync cursor state for a profile."""
    raw = _read_json(cursor_path(profile_dir), {})
    return {**DEFAULT_CURSOR, **raw}


def save_cursor(profile_dir: Path, state: dict) -> None:
    """Persist cursor state atomically."""
    _atomic_write_json(cursor_path(profile_dir), state)


# ── Tombstones ────────────────────────────────────────

def load_tombstones(profile_dir: Path) -> list[dict]:
    """Return the list of pending delete tombstones."""
    raw = _read_json(
        tombstones_path(profile_dir), {"tombstones": []},
    )
    return raw.get("tombstones", [])


def save_tombstones(
    profile_dir: Path, tombstones: list[dict],
) -> None:
    """Persist tombstones atomically."""
    _atomic_write_json(
        tombstones_path(profile_dir),
        {"tombstones": tombstones},
    )


def record_tombstone(
    profile_dir: Path, entry: dict,
) -> None:
    """Append a tombstone for a deleted local entry.

    The entry must carry at least ``sync_id`` and
    ``deleted_at``. Duplicate ids are collapsed (later
    write wins).
    """
    sid = entry.get("sync_id")
    if not sid:
        return
    tombstones = load_tombstones(profile_dir)
    tombstones = [
        t for t in tombstones if t.get("sync_id") != sid
    ]
    tombstones.append(entry)
    save_tombstones(profile_dir, tombstones)


def clear_tombstones(
    profile_dir: Path, sync_ids: list[str],
) -> None:
    """Remove tombstones by ``sync_id``."""
    if not sync_ids:
        return
    keep = [
        t for t in load_tombstones(profile_dir)
        if t.get("sync_id") not in set(sync_ids)
    ]
    save_tombstones(profile_dir, keep)
