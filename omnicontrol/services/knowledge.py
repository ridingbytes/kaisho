"""Knowledge base service.

Searches and reads files from configurable KB source directories.
Each source has a label (shown in the UI) and a filesystem path.
"""
import re
from pathlib import Path

# File extensions to index
KB_EXTENSIONS = {"*.md", "*.org", "*.rst", "*.txt"}


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


def file_tree(sources: list[dict]) -> list[dict]:
    """Return list of all KB files across source dirs.

    Each dict: {path, label, name, size}
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
            })
    return entries


def read_file(
    sources: list[dict], rel_path: str
) -> str | None:
    """Return content of a KB file by relative path."""
    for _label, base in _expand_sources(sources):
        candidate = base / rel_path
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
            path = base / rel_path
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
        candidate = base / rel_path
        if candidate.exists() and candidate.is_file():
            candidate.unlink()
            return True
    return False


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
