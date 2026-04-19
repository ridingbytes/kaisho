"""Backup service.

Creates, lists and prunes zip-archive backups of a data
directory. Used by the CLI (``kai backup``), the HTTP API
(``/api/backup/*``), the scheduler (periodic backups) and
the advisor tool (``create_backup``).

Backup filenames follow the pattern
``kaisho-<profile>-<YYYY-MM-DD_HHMMSS>.zip`` so they sort
chronologically and are easy to identify.
"""
from __future__ import annotations

import logging
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from ..time_utils import local_now

_LOG = logging.getLogger(__name__)

# Files / directories always excluded from backups because
# they are volatile state (e.g. open SQLite lock files) or
# contain backups themselves (would cause recursion).
_EXCLUDE_NAMES = {
    "backups",
    ".DS_Store",
    "__pycache__",
}

_TIMESTAMP_FMT = "%Y-%m-%d_%H%M%S"
_FILENAME_RE = re.compile(
    r"^kaisho-(?P<profile>[\w-]+)"
    r"-(?P<ts>\d{4}-\d{2}-\d{2}_\d{6})\.zip$",
)


@dataclass
class BackupInfo:
    """Metadata describing a single backup archive."""
    path: Path
    filename: str
    size_bytes: int
    created_at: datetime
    profile: str

    def to_dict(self) -> dict:
        return {
            "path": str(self.path),
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "created_at": self.created_at.isoformat(),
            "profile": self.profile,
        }


def _should_skip(relative: Path) -> bool:
    """True when a relative path should not be archived."""
    parts = relative.parts
    if not parts:
        return True
    return any(p in _EXCLUDE_NAMES for p in parts)


def _build_filename(
    profile: str, timestamp: datetime,
) -> str:
    """Return the standardised backup archive filename."""
    stamp = timestamp.strftime(_TIMESTAMP_FMT)
    safe = re.sub(r"[^\w-]", "_", profile) or "default"
    return f"kaisho-{safe}-{stamp}.zip"


def _add_file_to_zip(
    zf: zipfile.ZipFile,
    source: Path,
    relative: Path,
) -> None:
    """Add a single file to the zip under its relative path."""
    try:
        zf.write(source, arcname=str(relative))
    except OSError as exc:
        _LOG.warning(
            "Skipping %s during backup: %s", source, exc,
        )


def _iter_files(root: Path):
    """Yield (absolute, relative) pairs for every file."""
    for src in root.rglob("*"):
        if not src.is_file():
            continue
        rel = src.relative_to(root)
        if _should_skip(rel):
            continue
        yield src, rel


def create_backup(
    source_dir: Path,
    backup_dir: Path,
    profile: str = "default",
    timestamp: datetime | None = None,
) -> BackupInfo:
    """Create a zip backup of ``source_dir``.

    The archive is written under ``backup_dir`` and the
    resulting path is returned as a BackupInfo.
    """
    if not source_dir.is_dir():
        raise ValueError(
            f"source_dir does not exist: {source_dir}"
        )
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = timestamp or local_now()
    filename = _build_filename(profile, ts)
    dest = backup_dir / filename

    with zipfile.ZipFile(
        dest, "w", compression=zipfile.ZIP_DEFLATED,
    ) as zf:
        for src, rel in _iter_files(source_dir):
            _add_file_to_zip(zf, src, rel)

    return _describe(dest)


def _describe(path: Path) -> BackupInfo:
    """Build a BackupInfo from an existing archive path."""
    m = _FILENAME_RE.match(path.name)
    if m:
        profile = m.group("profile")
        created = datetime.strptime(
            m.group("ts"), _TIMESTAMP_FMT,
        )
    else:
        profile = ""
        created = datetime.fromtimestamp(
            path.stat().st_mtime,
        )
    return BackupInfo(
        path=path,
        filename=path.name,
        size_bytes=path.stat().st_size,
        created_at=created,
        profile=profile,
    )


def restore_backup(
    archive_path: Path,
    target_dir: Path,
) -> int:
    """Restore a backup archive into ``target_dir``.

    Extracts all files from the zip, overwriting existing
    files. Only files inside the profile directory are
    included in backups — external paths (e.g. ~/ownCloud)
    are NOT backed up and therefore NOT restored.

    :param archive_path: Path to the .zip backup.
    :param target_dir: Directory to restore into.
    :returns: Number of files restored.
    """
    if not archive_path.is_file():
        raise ValueError(
            f"Backup not found: {archive_path}",
        )
    target_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(archive_path, "r") as zf:
        for member in zf.namelist():
            if member.endswith("/") or ".." in member:
                continue
            dest = target_dir / member
            dest.parent.mkdir(
                parents=True, exist_ok=True,
            )
            with zf.open(member) as src:
                dest.write_bytes(src.read())
            count += 1
    _LOG.info(
        "Restored %d files from %s into %s",
        count, archive_path.name, target_dir,
    )
    return count


def list_backups(backup_dir: Path) -> list[BackupInfo]:
    """Return backups in ``backup_dir`` newest first."""
    if not backup_dir.is_dir():
        return []
    backups = [
        _describe(p)
        for p in backup_dir.iterdir()
        if p.is_file()
        and _FILENAME_RE.match(p.name)
    ]
    backups.sort(
        key=lambda b: b.created_at, reverse=True,
    )
    return backups


def prune_backups(
    backup_dir: Path, keep: int,
) -> list[BackupInfo]:
    """Delete all but the newest ``keep`` backups.

    Returns the list of removed archives. ``keep`` values
    less than 1 are treated as "keep none" explicitly so
    callers must opt into that by passing 0.
    """
    if keep < 0:
        raise ValueError("keep must be >= 0")
    backups = list_backups(backup_dir)
    if len(backups) <= keep:
        return []
    to_remove = backups[keep:]
    for info in to_remove:
        try:
            info.path.unlink()
        except OSError as exc:
            _LOG.warning(
                "Could not delete %s: %s",
                info.path, exc,
            )
    return to_remove
