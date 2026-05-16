"""Knowledge base service.

Searches and reads files from configurable KB source
directories. Each source has a label (shown in the UI)
and a filesystem path.

Metadata (tags, title, status, ...) lives in a separate
``kb_meta.yaml`` index per profile -- see ``kb_index``.
This module never reads or writes YAML frontmatter from
the source files; the index is the single source of
truth.
"""
import hashlib
import logging
import os
import re
import tempfile
from pathlib import Path

from . import kb_frontmatter, kb_index

log = logging.getLogger(__name__)

# File extensions to index. We deliberately keep this
# curated rather than "anything that decodes as utf-8" so
# we don't pollute the tree with images, archives, or
# build artefacts. Add new shapes here as they show up in
# real KBs.
KB_EXTENSIONS = {
    # Prose / docs
    "*.md", "*.markdown", "*.mdx",
    "*.org", "*.rst",
    "*.txt", "*.text",
    "*.tex", "*.bib",
    "*.adoc", "*.asciidoc",
    "*.pdf",
    # Structured data the user actually reads
    "*.json", "*.jsonc",
    "*.yaml", "*.yml",
    "*.toml",
    "*.xml",
    "*.csv", "*.tsv",
    "*.ini", "*.cfg", "*.conf",
    "*.env",
    "*.log",
    # Shell / scripting
    "*.sh", "*.bash", "*.zsh", "*.fish",
    "*.ps1",
    # Languages we commonly take notes alongside
    "*.py", "*.pyx",
    "*.js", "*.mjs", "*.cjs", "*.ts", "*.tsx",
    "*.html", "*.htm", "*.css", "*.scss",
    "*.go", "*.rs", "*.java", "*.kt",
    "*.c", "*.h", "*.cpp", "*.hpp", "*.cc", "*.hh",
    "*.cs", "*.swift",
    "*.rb", "*.php", "*.pl",
    "*.lua", "*.r",
    "*.lisp", "*.clj", "*.el", "*.scm",
    "*.sql",
    # Build / infra
    "*.dockerfile", "Dockerfile",
    "*.mk", "Makefile",
    "*.gradle",
}

# Markdown-only extensions, used for the opt-in
# ``import_frontmatter`` migration helper.
MARKDOWN_EXTENSIONS = {".md", ".markdown", ".mdx"}


def _safe_path(base: Path, rel_path: str) -> Path:
    """Resolve rel_path under base and verify it
    stays inside.

    Uses ``Path.relative_to()`` which is immune to
    prefix-overlap bypasses (e.g. ``/data/kbevil``
    matching ``/data/kb`` via string comparison).

    :param base: Base directory.
    :param rel_path: Untrusted relative path.
    :returns: Resolved absolute path.
    :raises ValueError: If the resolved path escapes
        the base directory (path traversal attack).
    """
    candidate = (base / rel_path).resolve()
    base_resolved = base.resolve()
    try:
        candidate.relative_to(base_resolved)
    except ValueError:
        raise ValueError(
            f"Path traversal blocked: {rel_path!r}"
        )
    return candidate


def _expand_sources(
    sources: list[dict],
) -> list[tuple[str, Path]]:
    """Return (label, expanded_path) pairs for existing dirs."""
    result = []
    for src in sources:
        p = Path(src["path"]).expanduser()
        if p.is_dir():
            result.append((src["label"], p))
    return result


def _has_dot_segment(rel: Path) -> bool:
    """True when any path segment starts with ``.``.

    Dot-folders (``.obsidian``, ``.git``, ``.trash``, etc.)
    are tool metadata that should never appear in the KB
    tree, regardless of the frontend hidden toggle. We
    skip them at the iteration layer so they don't even
    enter the cache or get parsed for frontmatter.
    """
    return any(p.startswith(".") for p in rel.parts)


def _iter_files(base: Path):
    """Yield all knowledge base files in a directory.

    Skips files inside dot-folders -- see
    ``_has_dot_segment``.
    """
    for ext in KB_EXTENSIONS:
        for f in sorted(base.rglob(ext)):
            if not _has_dot_segment(f.relative_to(base)):
                yield f


def _iter_empty_dirs(base: Path) -> list[Path]:
    """Yield directories that contain no KB files."""
    result = []
    for d in sorted(base.rglob("*")):
        if not d.is_dir():
            continue
        if _has_dot_segment(d.relative_to(base)):
            continue
        has_files = any(
            f for ext in KB_EXTENSIONS
            for f in d.glob(ext)
        )
        if not has_files:
            result.append(d)
    return result


def file_tree(
    sources: list[dict], profile_dir: Path,
) -> list[dict]:
    """Return list of all KB files and empty folders.

    Each file entry is enriched with metadata from the
    central index (``kb_meta.yaml``): ``title``, ``tags``,
    ``status``, ``type``. Files unknown to the index get
    an empty ``tags: []`` so the UI shape stays stable.

    Files: ``{path, label, name, size, kind, title?,
    tags?, status?, type?}``.
    Folders: ``{path, label, name, size, kind}``.
    """
    records = kb_index.load_index(profile_dir)
    by_key = {r.key: r for r in records}
    entries: list[dict] = []
    for label, base in _expand_sources(sources):
        for f in _iter_files(base):
            entries.append(
                _file_entry(label, base, f, by_key),
            )
        for d in _iter_empty_dirs(base):
            rel = d.relative_to(base)
            entries.append({
                "path": str(rel),
                "label": label,
                "name": d.name,
                "size": 0,
                "kind": "folder",
            })
    return entries


def _file_entry(
    label: str,
    base: Path,
    f: Path,
    index_by_key: dict[tuple[str, str], "kb_index.FileRecord"],
) -> dict:
    """Build the tree entry for a single file."""
    rel = str(f.relative_to(base))
    stat = f.stat()
    entry = {
        "path": rel,
        "label": label,
        "name": f.stem,
        "size": stat.st_size,
        "mtime": stat.st_mtime,
        "kind": "file",
    }
    record = index_by_key.get((label, rel))
    if record is not None:
        if record.title:
            entry["title"] = record.title
        entry["tags"] = list(record.tags)
        if record.status:
            entry["status"] = record.status
        if record.type:
            entry["type"] = record.type
        if record.customer:
            entry["customer"] = record.customer
        if record.task_id:
            entry["task_id"] = record.task_id
    else:
        entry["tags"] = []
    return entry


def create_folder(
    sources: list[dict], label: str, rel_path: str,
) -> dict:
    """Create a folder in a KB source directory."""
    for src_label, base in _expand_sources(sources):
        if src_label == label:
            path = _safe_path(base, rel_path)
            path.mkdir(parents=True, exist_ok=True)
            return {
                "path": str(path.relative_to(base)),
                "label": label,
                "name": path.name,
            }
    raise ValueError(f"Unknown KB source: {label!r}")


_pdf_cache: dict[str, str | None] = {}


def _pdf_disk_cache_dir() -> Path | None:
    """Profile-independent on-disk PDF text cache root.

    Returns ``None`` if the config can't be loaded (e.g.
    a test importing this module without bootstrapping
    config), if the directory cannot be created, or if
    settings validation fails. The directory is created
    lazily on first access.
    """
    try:
        from ..config import get_config
        root = get_config().DATA_DIR / "cache" / "kb_pdf"
        root.mkdir(parents=True, exist_ok=True)
        return root
    except (OSError, RuntimeError, ValueError):
        # ``ValueError`` covers pydantic-settings
        # ``ValidationError`` (a ValueError subclass).
        return None


def _pdf_cache_key(path: Path) -> str | None:
    """md5 of ``abs_path:mtime:size``.

    The key invalidates on any content edit that touches
    the file's mtime or size -- the common case. Two
    edge cases remain theoretically possible but rare:

    1. An atomic rename-replace (``mv tmp.pdf foo.pdf``)
       that inherits the original mtime *and* yields the
       same byte size. Practical risk near zero.
    2. Filesystems with coarse mtime resolution (HFS+ at
       1s, some networked FSes at 2s) where two writes
       within the resolution window report the same
       mtime. Hash-of-content would be more robust;
       cheap stat-based key is the trade-off chosen for
       speed.

    Returns ``None`` when the file is gone.
    """
    try:
        st = path.stat()
    except OSError:
        return None
    raw = f"{path.resolve()}:{st.st_mtime}:{st.st_size}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _read_pdf_disk_cache(key: str) -> str | None:
    root = _pdf_disk_cache_dir()
    if root is None:
        return None
    cache_file = root / f"{key}.txt"
    if not cache_file.exists():
        return None
    try:
        return cache_file.read_text(
            encoding="utf-8", errors="replace",
        )
    except OSError:
        return None


_disk_cache_warned = False


def _write_pdf_disk_cache(key: str, text: str) -> None:
    """Atomic write: tempfile in same directory then
    ``os.replace`` so concurrent readers never see a
    truncated cache file. Failures (disk full, perms,
    read-only mount) are logged once per process rather
    than spamming -- subsequent failures are swallowed
    silently so search isn't disrupted."""
    global _disk_cache_warned
    root = _pdf_disk_cache_dir()
    if root is None:
        return
    cache_file = root / f"{key}.txt"
    try:
        # ``delete=False`` so we can rename; tempfile is
        # closed before the rename happens.
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8",
            dir=root, prefix=f".{key}.",
            suffix=".tmp", delete=False,
        ) as tmp:
            tmp.write(text)
            tmp_path = tmp.name
        os.replace(tmp_path, cache_file)
    except OSError as exc:
        if not _disk_cache_warned:
            log.warning(
                "PDF text cache write failed: %s. "
                "Searches will still work but cold-start "
                "extraction will repeat each session.",
                exc,
            )
            _disk_cache_warned = True


def _pdftotext(path: str) -> str | None:
    """Try extracting text via the pdftotext CLI tool.

    Returns ``None`` if pdftotext is not installed or
    fails.
    """
    import shutil
    import subprocess
    if not shutil.which("pdftotext"):
        return None
    try:
        result = subprocess.run(
            ["pdftotext", path, "-"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout
    except (subprocess.TimeoutExpired, OSError):
        pass
    return None


def _pypdf_extract(path: str) -> str | None:
    """Fallback: extract text using pypdf."""
    try:
        import logging
        logging.getLogger("pypdf").setLevel(
            logging.ERROR,
        )
        from pypdf import PdfReader
        reader = PdfReader(path)
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n\n".join(pages) if pages else None
    except (ImportError, OSError, ValueError):
        return None


def _extract_pdf_text(path: Path) -> str | None:
    """Extract text from a PDF file.

    Looks up the on-disk cache first (keyed by path,
    mtime, and size). On miss, falls back to ``pdftotext``
    (poppler) or ``pypdf``, writing the result back to
    both the in-memory and on-disk caches.

    The in-memory cache is keyed by the *disk* cache key
    (path+mtime+size) rather than by raw path so an edit
    to the source PDF invalidates the in-memory entry
    naturally on the next call.
    """
    disk_key = _pdf_cache_key(path)
    if disk_key is None:
        return None
    if disk_key in _pdf_cache:
        return _pdf_cache[disk_key]
    cached = _read_pdf_disk_cache(disk_key)
    if cached is not None:
        _pdf_cache[disk_key] = cached
        return cached
    result = _pdftotext(str(path)) or _pypdf_extract(
        str(path),
    )
    _pdf_cache[disk_key] = result
    if result:
        _write_pdf_disk_cache(disk_key, result)
    return result


def refresh_pdf_cache(
    sources: list[dict],
) -> tuple[int, int]:
    """Walk every PDF once: extract text into the cache,
    record live keys, then prune any on-disk cache file
    whose key isn't in the live set.

    :returns: ``(warmed, pruned)``.
    """
    keep: set[str] = set()
    warmed = 0
    for _label, base in _expand_sources(sources):
        for f in _iter_files(base):
            if f.suffix.lower() != ".pdf":
                continue
            key = _pdf_cache_key(f)
            if key is None:
                continue
            keep.add(f"{key}.txt")
            text = _extract_pdf_text(f)
            if text:
                warmed += 1
    pruned = _prune_unknown(keep)
    return warmed, pruned


def _prune_unknown(keep: set[str]) -> int:
    """Remove cache entries whose name isn't in ``keep``.
    Treats real files and dangling symlinks as candidates;
    leaves subdirectories alone."""
    root = _pdf_disk_cache_dir()
    if root is None or not root.exists():
        return 0
    pruned = 0
    for entry in root.iterdir():
        if entry.is_dir() and not entry.is_symlink():
            continue
        if entry.name in keep:
            continue
        try:
            entry.unlink()
            pruned += 1
        except OSError:
            pass
    return pruned


def clear_pdf_cache() -> int:
    """Wipe every entry from the on-disk PDF cache.
    Returns the count of removed files. Used by
    ``kai kb cache clear``."""
    _pdf_cache.clear()
    return _prune_unknown(keep=set())


def pdf_cache_info() -> dict:
    """Return ``{path, entries, size_bytes}`` describing
    the on-disk PDF cache. ``path`` is ``None`` when the
    cache hasn't been initialised yet."""
    root = _pdf_disk_cache_dir()
    if root is None or not root.exists():
        return {
            "path": None, "entries": 0, "size_bytes": 0,
        }
    entries = [e for e in root.iterdir() if e.is_file()]
    return {
        "path": str(root),
        "entries": len(entries),
        "size_bytes": sum(
            e.stat().st_size for e in entries
        ),
    }


def read_file(
    sources: list[dict], rel_path: str
) -> str | None:
    """Return content of a KB file by relative path.

    For PDFs, extracts text using pypdf. Returns
    ``None`` if the file doesn't exist or can't be read.
    """
    for _label, base in _expand_sources(sources):
        try:
            candidate = _safe_path(base, rel_path)
        except ValueError:
            continue
        if candidate.exists() and candidate.is_file():
            if candidate.suffix.lower() == ".pdf":
                return _extract_pdf_text(candidate)
            try:
                return candidate.read_text(
                    encoding="utf-8",
                )
            except UnicodeDecodeError:
                return None
    return None


def resolve_path(
    sources: list[dict], rel_path: str,
) -> str | None:
    """Resolve a relative KB path to an absolute path.

    Returns ``None`` if the file doesn't exist or the
    path escapes the source directory.
    """
    for _label, base in _expand_sources(sources):
        try:
            candidate = _safe_path(base, rel_path)
        except ValueError:
            continue
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    return None


def write_file(
    sources: list[dict],
    label: str,
    rel_path: str,
    content: str,
) -> dict:
    """Write content to a KB file, creating it if needed."""
    for src_label, base in _expand_sources(sources):
        if src_label == label:
            path = _safe_path(base, rel_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            return {
                "path": rel_path,
                "label": label,
                "name": path.stem,
                "size": path.stat().st_size,
            }
    raise ValueError(f"Unknown KB source: {label!r}")


def delete_file(
    sources: list[dict], rel_path: str
) -> bool:
    """Delete a KB file. Returns False if not found."""
    for _label, base in _expand_sources(sources):
        try:
            candidate = _safe_path(base, rel_path)
        except ValueError:
            continue
        if candidate.exists() and candidate.is_file():
            candidate.unlink()
            return True
    return False


def rename_file(
    sources: list[dict],
    old_path: str,
    new_path: str,
) -> dict:
    """Rename or move a KB file within its source.

    old_path and new_path are relative to the source root.
    Creates parent directories for new_path if needed.
    Returns the updated file dict.
    """
    for label, base in _expand_sources(sources):
        try:
            src = _safe_path(base, old_path)
            dst = _safe_path(base, new_path)
        except ValueError:
            continue
        if not src.exists() or not src.is_file():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
        # Clean up empty parent dirs
        for parent in src.parents:
            if parent == base:
                break
            if parent.exists() and not any(parent.iterdir()):
                parent.rmdir()
        return {
            "path": new_path,
            "label": label,
            "name": dst.stem,
            "size": dst.stat().st_size,
        }
    raise ValueError(f"File not found: {old_path!r}")


def move_file(
    sources: list[dict],
    old_path: str,
    old_label: str,
    new_label: str,
    new_path: str | None = None,
) -> dict:
    """Move a KB file from one source to another.

    If new_path is None, keeps the same relative path.
    """
    dest_path = new_path or old_path
    src_base = dst_base = None
    for lbl, base in _expand_sources(sources):
        if lbl == old_label:
            src_base = base
        if lbl == new_label:
            dst_base = base
    if src_base is None:
        raise ValueError(f"Source not found: {old_label!r}")
    if dst_base is None:
        raise ValueError(f"Destination not found: {new_label!r}")
    src = _safe_path(src_base, old_path)
    if not src.exists():
        raise ValueError(f"File not found: {old_path!r}")
    dst = _safe_path(dst_base, dest_path)
    dst.parent.mkdir(parents=True, exist_ok=True)
    content = src.read_text(encoding="utf-8")
    dst.write_text(content, encoding="utf-8")
    src.unlink()
    return {
        "path": dest_path,
        "label": new_label,
        "name": dst.stem,
        "size": dst.stat().st_size,
    }


def search(
    sources: list[dict],
    query: str,
    max_files: int = 50,
    max_hits_per_file: int = 20,
    paths: list[str] | None = None,
    mode: str = "substring",
) -> list[dict]:
    """Full-text search across KB files.

    The result cap is **per file**, not per line. The
    UI groups hits by file, so a common term used to
    burn the entire budget on a single common file.
    Now each file contributes up to ``max_hits_per_file``
    hits, and at most ``max_files`` distinct files
    surface in total.

    :param paths: When provided, restrict the search to files
        whose ``rel_path`` matches an entry. Lets the UI run a
        filename filter first and search only inside what
        passed -- the "filter then search" pattern.
    :param mode: Match mode. Only ``"substring"`` is wired
        today; the parameter exists so future ``"regex"``
        and ``"glob"`` modes can be threaded through
        callers without another signature change.
    :returns: Matches as ``{path, label, line_number,
        snippet}``, file-grouped order preserved.
    """
    if not query.strip():
        return []
    pattern = _compile_query(query.strip(), mode)
    allow = set(paths) if paths is not None else None
    results: list[dict] = []
    files_with_hits = 0
    for label, base in _expand_sources(sources):
        if files_with_hits >= max_files:
            break
        for f in _iter_files(base):
            if files_with_hits >= max_files:
                break
            rel = str(f.relative_to(base))
            if allow is not None and rel not in allow:
                continue
            lines = _read_lines_for_search(f)
            if lines is None:
                continue
            hits_for_file = _collect_file_hits(
                lines, pattern, rel, label,
                max_hits_per_file,
            )
            if hits_for_file:
                results.extend(hits_for_file)
                files_with_hits += 1
    return results


def _compile_query(query: str, mode: str) -> re.Pattern:
    """Translate a user query into a regex per ``mode``.

    Only ``"substring"`` is wired today. Unknown modes
    fall back to substring so an out-of-date caller
    never crashes the search. Reserved for future
    ``"regex"`` / ``"glob"`` branches."""
    return re.compile(re.escape(query), re.IGNORECASE)


def _read_lines_for_search(f: Path) -> list[str] | None:
    """Read text content of a KB file as a list of lines.

    Returns ``None`` when the file cannot be read or
    yields no text (e.g. unreadable PDF). Strips YAML
    frontmatter from markdown files so old in-file
    blocks don't surface as search hits.

    Loads the entire file into memory; fine for the
    current corpus (markdown notes + extracted PDF
    text). Switch to a streaming iterator only when
    multi-MB logs or full books become a real workload.
    """
    try:
        if f.suffix.lower() == ".pdf":
            text = _extract_pdf_text(f)
            if not text:
                return None
            return text.splitlines()
        text = f.read_text(
            encoding="utf-8", errors="replace",
        )
        if f.suffix.lower() in MARKDOWN_EXTENSIONS:
            text = kb_frontmatter.parse(text).body or text
        return text.splitlines()
    except OSError:
        return None


def _collect_file_hits(
    lines: list[str],
    pattern: re.Pattern,
    rel: str,
    label: str,
    limit: int,
) -> list[dict]:
    """Return up to ``limit`` matching lines for one file."""
    hits: list[dict] = []
    for i, line in enumerate(lines, start=1):
        if pattern.search(line):
            hits.append({
                "path": rel,
                "label": label,
                "line_number": i,
                "snippet": line.strip(),
            })
            if len(hits) >= limit:
                break
    return hits


def resolve_label(
    sources: list[dict], rel_path: str,
) -> str | None:
    """Return the source label that owns ``rel_path``, or
    ``None`` when the file is not under any KB source."""
    for label, base in _expand_sources(sources):
        try:
            candidate = _safe_path(base, rel_path)
        except ValueError:
            continue
        if candidate.is_file():
            return label
    return None


def iter_kb_files(sources: list[dict]):
    """Yield ``(label, base, file_path)`` for every file
    across all KB sources, regardless of extension. Used
    by the index reindex pass."""
    for label, base in _expand_sources(sources):
        for f in _iter_files(base):
            yield label, base, f


def iter_markdown_files(sources: list[dict]):
    """Same as :func:`iter_kb_files` but only markdown.
    Used by the opt-in frontmatter import."""
    for label, base, f in iter_kb_files(sources):
        if f.suffix.lower() in MARKDOWN_EXTENSIONS:
            yield label, base, f


def list_tags(profile_dir: Path) -> list[str]:
    """Return the sorted unique union of tags from the
    metadata index."""
    return kb_index.list_tags(
        kb_index.load_index(profile_dir),
    )


def distinct_values(profile_dir: Path) -> dict:
    """Sorted unique values for each indexable enum-ish
    metadata key, sourced from the index. Powers the
    metadata-editor autocompletes without fetching the
    full file tree."""
    records = kb_index.load_index(profile_dir)
    statuses: set[str] = set()
    types: set[str] = set()
    customers: set[str] = set()
    for record in records:
        if record.status:
            statuses.add(record.status)
        if record.type:
            types.add(record.type)
        if record.customer:
            customers.add(record.customer)
    return {
        "status": sorted(statuses),
        "type": sorted(types),
        "customer": sorted(customers),
    }


def get_metadata(
    sources: list[dict],
    profile_dir: Path,
    rel_path: str,
) -> dict | None:
    """Return the indexed metadata for a KB file.

    Resolves the file under one of the configured sources
    so the call short-circuits to ``None`` for missing
    files. When the file exists but the index has no
    record (e.g. between reindex runs), the function
    returns an empty-but-shape-stable dict so the UI can
    still write keys via PATCH.

    :returns: ``{"title": str, "tags": list, ...}`` with
        only set optional keys present, or ``None`` if
        the file does not exist on disk.
    """
    for label, base in _expand_sources(sources):
        try:
            candidate = _safe_path(base, rel_path)
        except ValueError:
            continue
        if not candidate.is_file():
            continue
        records = kb_index.load_index(profile_dir)
        record = kb_index.lookup(records, label, rel_path)
        if record is None:
            return {"title": "", "tags": []}
        return record.metadata_dict()
    return None


def update_metadata(
    sources: list[dict],
    profile_dir: Path,
    rel_path: str,
    patch: dict,
) -> dict:
    """Patch a file's metadata in the index. The KB file
    on disk is never touched.

    The load -> mutate -> save cycle runs under
    ``kb_index.index_guard`` so a concurrent reindex pass
    -- including one running in another process via the
    CLI -- cannot interleave and overwrite the patch.

    :raises ValueError: If the file is not found under
        any source.
    """
    for label, base in _expand_sources(sources):
        try:
            candidate = _safe_path(base, rel_path)
        except ValueError:
            continue
        if not candidate.is_file():
            continue
        with kb_index.index_guard(profile_dir):
            records = kb_index.load_index(profile_dir)
            record = kb_index.update_metadata(
                records, label, rel_path, patch,
            )
            if patch:
                kb_index.save_index(profile_dir, records)
        return record.metadata_dict()
    raise ValueError(f"File not found: {rel_path}")
