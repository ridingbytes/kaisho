"""Knowledge-base metadata index.

Single source of truth for all KB metadata (tags, title,
status, etc). Lives in ``<profile>/kb_meta.yaml``. The
file format is a flat record list keyed by
``(label, path)``::

    files:
      - label: knowledge
        path: it-admin/ansible.md
        hash: ab12cd34
        indexed_at: 2026-05-08T10:00:00
        title: Ansible
        tags: [ansible, it-admin]
        ...

The index leaves the source files completely untouched.
``reindex`` walks every KB file, hashes it (cached by
``(mtime, size)`` to avoid re-hashing), prunes records
for files that have disappeared, and reattaches metadata
to renamed files via hash matching.

Markdown frontmatter is intentionally ignored by the
indexer -- it is import-only via ``import_frontmatter``,
which reads the YAML block and copies canonical keys
into the index without modifying the file.
"""
from __future__ import annotations

import contextlib
import hashlib
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

import yaml

# In-process re-entrant lock. Reentrancy lets a function
# that already holds the lock call helpers (``save_index``,
# ``lookup``) without deadlocking. Process-internal
# parallelism is the FastAPI server handling concurrent
# requests; the cross-process serialization is handled by
# the file lock below.
INDEX_LOCK = threading.RLock()

# Canonical metadata keys (mirrored from kb_frontmatter so
# the import path stays trivial).
METADATA_KEYS: tuple[str, ...] = (
    "title",
    "tags",
    "created",
    "customer",
    "task_id",
    "type",
    "status",
)

INDEX_FILENAME = "kb_meta.yaml"


@dataclass
class FileRecord:
    """One file's row in the index.

    ``label``/``path`` is the primary key. ``hash`` enables
    rename detection -- when the path disappears but a
    matching hash shows up under a different path, we
    reattach the metadata. ``indexed_at`` lets us tell at
    a glance how stale a record is.

    The ``summary*`` fields cache the AI-generated summary
    so we don't re-run the model on every popover open.
    ``summary_hash`` snapshots the file's content hash at
    the moment the summary was generated; comparing it
    against ``hash`` after a reindex tells us whether the
    summary is still fresh.
    """

    label: str
    path: str
    hash: str = ""
    indexed_at: str = ""
    title: str = ""
    tags: list[str] = field(default_factory=list)
    created: str | None = None
    customer: str | None = None
    task_id: str | None = None
    type: str | None = None
    status: str | None = None
    summary: str = ""
    summary_model: str = ""
    summary_hash: str = ""
    summary_at: str = ""

    @property
    def key(self) -> tuple[str, str]:
        return (self.label, self.path)

    def metadata_dict(self) -> dict[str, Any]:
        """Return the user-facing metadata view (no hash /
        indexed_at). ``tags`` is always present; other
        optional keys are omitted when empty."""
        out: dict[str, Any] = {
            "title": self.title,
            "tags": list(self.tags),
        }
        for key in METADATA_KEYS:
            if key in {"title", "tags"}:
                continue
            value = getattr(self, key)
            if value:
                out[key] = value
        return out


@dataclass
class ReindexReport:
    """Summary of one reindex pass for the CLI / API."""

    scanned: int = 0
    added: int = 0
    updated: int = 0
    renamed: int = 0
    pruned: int = 0
    unchanged: int = 0


def index_path(profile_dir: Path) -> Path:
    """Resolve the index file path for a profile dir."""
    return profile_dir / INDEX_FILENAME


def _lock_path(profile_dir: Path) -> Path:
    return profile_dir / (INDEX_FILENAME + ".lock")


@contextlib.contextmanager
def index_guard(profile_dir: Path) -> Iterator[None]:
    """Serialize concurrent access to a profile's index.

    Combines the in-process ``INDEX_LOCK`` with an
    advisory OS-level ``fcntl.flock`` on a sibling
    ``kb_meta.yaml.lock`` file. The OS lock is what keeps
    a CLI ``kai kb reindex`` from racing the running
    server's ``PATCH /file/metadata`` -- both processes
    contend for the same lock file and only one runs at a
    time. When ``fcntl`` is unavailable (Windows), we
    fall back to the in-process lock alone with a
    warning; on Windows the user simply shouldn't run
    CLI write commands while the server is up.
    """
    profile_dir.mkdir(parents=True, exist_ok=True)
    lock_file = _lock_path(profile_dir)
    with INDEX_LOCK:
        try:
            import fcntl
        except ImportError:
            yield
            return
        # ``open`` for write+read so the FD is valid for
        # the OS lock; the file's contents are never
        # written to.
        with open(lock_file, "a+") as fh:
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
                yield
            finally:
                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def load_index(profile_dir: Path) -> list[FileRecord]:
    """Read the index from disk.

    Returns an empty list when the index doesn't exist
    yet, so callers don't need to special-case bootstrap.
    """
    p = index_path(profile_dir)
    if not p.exists():
        return []
    try:
        data = yaml.safe_load(p.read_text("utf-8")) or {}
    except yaml.YAMLError:
        return []
    if not isinstance(data, dict):
        return []
    raw_files = data.get("files") or []
    if not isinstance(raw_files, list):
        return []
    return [_record_from_dict(r) for r in raw_files]


def save_index(
    profile_dir: Path, records: Iterable[FileRecord],
) -> None:
    """Write the index atomically.

    ``records`` are sorted by ``(label, path)`` so the
    on-disk file is diff-stable across saves.
    """
    p = index_path(profile_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    sorted_records = sorted(
        records, key=lambda r: (r.label, r.path),
    )
    payload = {
        "files": [
            _record_to_dict(r) for r in sorted_records
        ],
    }
    text = yaml.safe_dump(
        payload,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(p)


def lookup(
    records: list[FileRecord], label: str, path: str,
) -> FileRecord | None:
    """Find the record for ``(label, path)`` -- O(N) but
    the index is small enough that a dict on every call
    would be wasteful."""
    for record in records:
        if record.label == label and record.path == path:
            return record
    return None


def list_tags(records: list[FileRecord]) -> list[str]:
    """Return the sorted unique union of free-text tags."""
    seen: set[str] = set()
    for record in records:
        seen.update(record.tags)
    return sorted(seen)


def update_metadata(
    records: list[FileRecord],
    label: str,
    path: str,
    patch: dict[str, Any],
) -> FileRecord:
    """Apply ``patch`` to a record. Creates the record if
    missing. ``None`` patch values clear the corresponding
    optional key. Empty patches are a no-op (no
    ``indexed_at`` bump, no record creation).
    """
    if not patch:
        existing = lookup(records, label, path)
        if existing is not None:
            return existing
        # No record + no patch: still no-op, but the
        # caller might rely on getting *something* back,
        # so synthesize a fresh empty record without
        # appending it.
        return FileRecord(label=label, path=path)
    record = lookup(records, label, path)
    if record is None:
        record = FileRecord(label=label, path=path)
        records.append(record)
    _apply_patch(record, patch)
    record.indexed_at = _now_iso()
    return record


def rename_tag(
    profile_dir: Path, old: str, new: str,
) -> dict:
    """Rename ``old`` to ``new`` across every record in
    the index.

    Merge semantics: when a record already contains
    ``new``, ``old`` is simply dropped (no duplicate).
    Tag order is preserved; the renamed tag stays at the
    position of the first match. Holds ``INDEX_LOCK`` for
    the load -> mutate -> save cycle.

    :returns: ``{"renamed": int, "merged": int}`` --
        ``renamed`` counts records where ``old`` was
        replaced with ``new``; ``merged`` counts records
        where ``new`` was already present (so the rename
        deduped instead of swapping). Both are disjoint.
    :raises ValueError: When ``old`` or ``new`` is empty
        or they are equal.
    """
    old_clean = old.strip()
    new_clean = new.strip()
    if not old_clean or not new_clean:
        raise ValueError("Tags must be non-empty")
    if old_clean == new_clean:
        raise ValueError(
            "Old and new tags are identical",
        )
    with index_guard(profile_dir):
        records = load_index(profile_dir)
        renamed = 0
        merged = 0
        for record in records:
            if old_clean not in record.tags:
                continue
            if new_clean in record.tags:
                record.tags = [
                    t for t in record.tags
                    if t != old_clean
                ]
                merged += 1
            else:
                record.tags = [
                    new_clean if t == old_clean else t
                    for t in record.tags
                ]
                renamed += 1
        if renamed or merged:
            save_index(profile_dir, records)
    return {"renamed": renamed, "merged": merged}


def get_summary(
    profile_dir: Path, label: str, path: str,
) -> dict | None:
    """Return the cached summary record for a file, or
    ``None`` when no summary has been generated yet.

    The returned dict carries a ``stale`` flag indicating
    whether the file's current hash differs from the hash
    captured when the summary was made; the caller can
    show the cached value while inviting a regenerate.
    """
    records = load_index(profile_dir)
    record = lookup(records, label, path)
    if record is None or not record.summary:
        return None
    return {
        "summary": record.summary,
        "model": record.summary_model,
        "summary_at": record.summary_at,
        "stale": (
            bool(record.hash)
            and bool(record.summary_hash)
            and record.hash != record.summary_hash
        ),
    }


def save_summary(
    profile_dir: Path,
    label: str,
    path: str,
    *,
    summary: str,
    model: str,
    file_hash: str,
) -> None:
    """Persist a generated summary on the file's record.
    Holds ``index_guard`` so a concurrent reindex (in
    this process or another) cannot clobber the value."""
    with index_guard(profile_dir):
        records = load_index(profile_dir)
        record = lookup(records, label, path)
        if record is None:
            record = FileRecord(label=label, path=path)
            records.append(record)
        record.summary = summary
        record.summary_model = model
        record.summary_hash = file_hash
        record.summary_at = _now_iso()
        save_index(profile_dir, records)


def clear_summary(
    profile_dir: Path, label: str, path: str,
) -> bool:
    """Remove the cached summary from a record. Returns
    ``True`` when something was actually cleared."""
    with index_guard(profile_dir):
        records = load_index(profile_dir)
        record = lookup(records, label, path)
        if record is None or not record.summary:
            return False
        record.summary = ""
        record.summary_model = ""
        record.summary_hash = ""
        record.summary_at = ""
        save_index(profile_dir, records)
        return True


def reindex(
    profile_dir: Path,
    file_iter: Iterable[tuple[str, Path, Path]],
    *,
    apply: bool = False,
) -> tuple[list[FileRecord], ReindexReport]:
    """Sync the index with the current state on disk.

    Holds the cross-process ``index_guard`` for the
    entire pass so a concurrent ``update_metadata`` --
    even from another process like a CLI ``kai kb
    set-metadata`` -- cannot interleave between our load
    and save. Files with identical content cannot have
    their metadata reattached unambiguously across a
    rename: when two missing records share a hash *or*
    two new records share a hash, we fall back to
    ``added`` + ``pruned`` rather than guess wrong, so
    duplicate-content files lose their metadata on
    rename and need to be re-tagged manually.

    :param file_iter: Iterable of ``(label, base, path)``
        for every file to track. Caller controls which
        extensions count.
    :param apply: When ``False`` (default) the function
        only computes the result; the caller can save the
        index if they like the report. When ``True`` the
        result is persisted before returning.
    :returns: The new record list and a ``ReindexReport``.
    """
    with index_guard(profile_dir):
        return _reindex_unlocked(
            profile_dir, file_iter, apply=apply,
        )


def _reindex_unlocked(
    profile_dir: Path,
    file_iter: Iterable[tuple[str, Path, Path]],
    *,
    apply: bool,
) -> tuple[list[FileRecord], ReindexReport]:
    existing = load_index(profile_dir)
    by_key = {r.key: r for r in existing}
    seen_keys: set[tuple[str, str]] = set()
    report = ReindexReport()

    new_records: list[FileRecord] = []
    new_for_rename: list[FileRecord] = []
    seen_paths: set[str] = set()

    for label, base, file_path in file_iter:
        report.scanned += 1
        rel = str(file_path.relative_to(base))
        record = by_key.get((label, rel))
        digest = _hash_file(file_path)
        seen_paths.add(_cache_key(file_path))
        if record is None:
            # Either a brand-new file or a renamed file.
            new_for_rename.append(FileRecord(
                label=label,
                path=rel,
                hash=digest,
                indexed_at=_now_iso(),
            ))
            continue
        seen_keys.add(record.key)
        if record.hash != digest:
            record.hash = digest
            record.indexed_at = _now_iso()
            report.updated += 1
        else:
            report.unchanged += 1
        new_records.append(record)

    # Rename detection: any record we haven't seen this
    # pass is "missing". Match a missing record to a
    # fresh record only when the hash is *unambiguous* --
    # multiple missing records sharing a hash, or
    # multiple fresh records sharing a hash, both fall
    # back to "added"/"pruned" rather than guess wrong.
    missing = [
        r for key, r in by_key.items()
        if key not in seen_keys
    ]
    missing_by_hash: dict[str, list[FileRecord]] = {}
    for r in missing:
        if r.hash:
            missing_by_hash.setdefault(r.hash, []).append(r)
    fresh_hashes: dict[str, int] = {}
    for fresh in new_for_rename:
        fresh_hashes[fresh.hash] = (
            fresh_hashes.get(fresh.hash, 0) + 1
        )

    consumed: set[tuple[str, str]] = set()
    for fresh in new_for_rename:
        candidates = missing_by_hash.get(fresh.hash, [])
        if (
            len(candidates) == 1
            and fresh_hashes[fresh.hash] == 1
        ):
            match = candidates[0]
            consumed.add(match.key)
            match.path = fresh.path
            match.label = fresh.label
            match.indexed_at = fresh.indexed_at
            new_records.append(match)
            report.renamed += 1
        else:
            new_records.append(fresh)
            report.added += 1

    # Pruned count = orphan records that we did NOT
    # consume during rename detection.
    report.pruned = sum(
        1 for r in missing if r.key not in consumed
    )

    _evict_hash_cache(seen_paths)

    if apply:
        save_index(profile_dir, new_records)

    return new_records, report


def import_frontmatter(
    profile_dir: Path,
    markdown_iter: Iterable[tuple[str, Path, Path]],
    *,
    apply: bool = False,
) -> tuple[list[FileRecord], int]:
    """Copy YAML frontmatter from markdown files into the
    index. Files are not modified.

    :param markdown_iter: ``(label, base, file_path)`` for
        every markdown file to import.
    :returns: ``(records, imported_count)``.
    """
    from . import kb_frontmatter

    with index_guard(profile_dir):
        return _import_frontmatter_unlocked(
            profile_dir,
            markdown_iter,
            apply=apply,
        )


def _import_frontmatter_unlocked(
    profile_dir: Path,
    markdown_iter: Iterable[tuple[str, Path, Path]],
    *,
    apply: bool,
) -> tuple[list[FileRecord], int]:
    from . import kb_frontmatter

    records = load_index(profile_dir)
    by_key = {r.key: r for r in records}
    imported = 0

    for label, base, file_path in markdown_iter:
        try:
            text = file_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        fm = kb_frontmatter.parse(text)
        if not fm.raw:
            continue  # No frontmatter to import.
        rel = str(file_path.relative_to(base))
        record = by_key.get((label, rel))
        if record is None:
            record = FileRecord(label=label, path=rel)
            records.append(record)
            by_key[record.key] = record
        # Copy canonical keys over. Existing index values
        # win when the import would otherwise overwrite a
        # non-empty value -- we never destroy data the
        # user has already entered through the UI.
        if not record.title and fm.title:
            record.title = fm.title
        if not record.tags and fm.tags:
            record.tags = list(fm.tags)
        for key in ("created", "customer", "task_id",
                    "type", "status"):
            if not getattr(record, key):
                value = getattr(fm, key)
                if value:
                    setattr(record, key, value)
        record.indexed_at = _now_iso()
        imported += 1

    if apply:
        save_index(profile_dir, records)

    return records, imported


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


_HASH_CACHE: dict[
    str, tuple[float, int, str]
] = {}


def _evict_hash_cache(active_paths: set[str]) -> None:
    """Drop cache entries for paths that no longer exist.
    Called at the end of a reindex so the cache size
    tracks the live KB rather than growing forever."""
    stale = [k for k in _HASH_CACHE if k not in active_paths]
    for key in stale:
        _HASH_CACHE.pop(key, None)


def _cache_key(path: Path) -> str:
    """Stable cache key for ``_HASH_CACHE``.

    Resolves the path so two calls from different CWDs
    or with vs. without ``..`` segments still hit the
    same entry. Falls back to ``str(path)`` when the
    path can't be resolved (broken symlink etc).
    """
    try:
        return str(path.resolve())
    except OSError:
        return str(path)


def _hash_file(path: Path) -> str:
    """md5 of file contents, cached by ``(mtime, size)``.

    md5 is not security-sensitive here -- it's purely a
    cheap content fingerprint for rename detection.
    """
    try:
        st = path.stat()
    except OSError:
        return ""
    key = _cache_key(path)
    cached = _HASH_CACHE.get(key)
    if (
        cached is not None
        and cached[0] == st.st_mtime
        and cached[1] == st.st_size
    ):
        return cached[2]
    digest = hashlib.md5()  # noqa: S324
    try:
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                digest.update(chunk)
    except OSError:
        return ""
    hex_digest = digest.hexdigest()
    _HASH_CACHE[key] = (
        st.st_mtime, st.st_size, hex_digest,
    )
    return hex_digest


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(
        timespec="seconds",
    )


def _apply_patch(
    record: FileRecord, patch: dict[str, Any],
) -> None:
    """Apply a UI-style patch dict to a ``FileRecord``."""
    for key, value in patch.items():
        if key not in METADATA_KEYS:
            continue
        if key == "tags":
            record.tags = _coerce_tag_list(value)
        elif key == "title":
            record.title = "" if value is None else str(value)
        else:
            setattr(record, key, value or None)


def _coerce_tag_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return [
            p.strip() for p in value.split(",") if p.strip()
        ]
    return [str(value)]


_RECORD_FIELDS = {
    "label", "path", "hash", "indexed_at",
    *METADATA_KEYS,
}


def _record_from_dict(data: Any) -> FileRecord:
    if not isinstance(data, dict):
        return FileRecord(label="", path="")
    record = FileRecord(
        label=str(data.get("label", "")),
        path=str(data.get("path", "")),
    )
    record.hash = str(data.get("hash", ""))
    record.indexed_at = str(data.get("indexed_at", ""))
    record.title = str(data.get("title", "") or "")
    record.tags = _coerce_tag_list(data.get("tags"))
    for key in ("created", "customer", "task_id",
                "type", "status"):
        value = data.get(key)
        if value not in (None, ""):
            setattr(record, key, str(value))
    record.summary = str(data.get("summary", "") or "")
    record.summary_model = str(
        data.get("summary_model", "") or "",
    )
    record.summary_hash = str(
        data.get("summary_hash", "") or "",
    )
    record.summary_at = str(
        data.get("summary_at", "") or "",
    )
    return record


def _record_to_dict(record: FileRecord) -> dict[str, Any]:
    """Emit a record dict with empty optionals omitted."""
    raw = asdict(record)
    out: dict[str, Any] = {
        "label": raw["label"],
        "path": raw["path"],
    }
    if raw["hash"]:
        out["hash"] = raw["hash"]
    if raw["indexed_at"]:
        out["indexed_at"] = raw["indexed_at"]
    if raw["title"]:
        out["title"] = raw["title"]
    out["tags"] = list(raw["tags"])
    for key in ("created", "customer", "task_id",
                "type", "status",
                "summary", "summary_model",
                "summary_hash", "summary_at"):
        if raw[key]:
            out[key] = raw[key]
    return out
