"""Knowledge base service.

Searches and reads files from configurable KB source directories.
Each source has a label (shown in the UI) and a filesystem path.
"""
import re
from pathlib import Path

# File extensions to index
KB_EXTENSIONS = {"*.md", "*.org", "*.rst", "*.txt"}


def _safe_path(base: Path, rel_path: str) -> Path:
    """Resolve rel_path under base and verify it stays inside.

    Raises ValueError if the resolved path escapes the base
    directory (path traversal attack).
    """
    candidate = (base / rel_path).resolve()
    base_resolved = base.resolve()
    if not str(candidate).startswith(str(base_resolved)):
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


def _iter_files(base: Path):
    """Yield all knowledge base files in a directory."""
    for ext in KB_EXTENSIONS:
        yield from sorted(base.rglob(ext))


def _iter_empty_dirs(base: Path) -> list[Path]:
    """Yield directories that contain no KB files."""
    result = []
    for d in sorted(base.rglob("*")):
        if not d.is_dir():
            continue
        has_files = any(
            f for ext in KB_EXTENSIONS
            for f in d.glob(ext)
        )
        if not has_files:
            result.append(d)
    return result


def file_tree(sources: list[dict]) -> list[dict]:
    """Return list of all KB files and empty folders.

    Files: {path, label, name, size, kind: "file"}
    Folders: {path, label, name, size: 0, kind: "folder"}
    """
    entries = []
    for label, base in _expand_sources(sources):
        for f in _iter_files(base):
            rel = f.relative_to(base)
            entries.append({
                "path": str(rel),
                "label": label,
                "name": f.stem,
                "size": f.stat().st_size,
                "kind": "file",
            })
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


def read_file(
    sources: list[dict], rel_path: str
) -> str | None:
    """Return content of a KB file by relative path."""
    for _label, base in _expand_sources(sources):
        try:
            candidate = _safe_path(base, rel_path)
        except ValueError:
            continue
        if candidate.exists() and candidate.is_file():
            return candidate.read_text(encoding="utf-8")
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
    max_results: int = 20,
) -> list[dict]:
    """Full-text search across KB files.

    Returns up to max_results matches.
    Each dict: {path, label, line_number, snippet}
    """
    if not query.strip():
        return []
    pattern = re.compile(
        re.escape(query.strip()), re.IGNORECASE
    )
    results = []
    for label, base in _expand_sources(sources):
        for f in _iter_files(base):
            rel = str(f.relative_to(base))
            try:
                lines = f.read_text(
                    encoding="utf-8", errors="replace"
                ).splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, start=1):
                if pattern.search(line):
                    results.append({
                        "path": rel,
                        "label": label,
                        "line_number": i,
                        "snippet": line.strip(),
                    })
                    if len(results) >= max_results:
                        return results
    return results
