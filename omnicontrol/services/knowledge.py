"""Knowledge base service.

Searches and reads markdown files from WISSEN_DIR and RESEARCH_DIR.
No SQLite needed — direct filesystem access.
"""
import re
from pathlib import Path


def _kb_dirs(
    wissen_dir: Path, research_dir: Path
) -> list[tuple[str, Path]]:
    """Return (label, expanded_path) pairs for existing KB dirs."""
    dirs = [
        ("wissen", wissen_dir.expanduser()),
        ("research", research_dir.expanduser()),
    ]
    return [(label, p) for label, p in dirs if p.is_dir()]


def file_tree(
    wissen_dir: Path, research_dir: Path
) -> list[dict]:
    """Return list of all markdown files across KB dirs.

    Each dict: {path, label, name, size}
    path is relative to the KB root dir (e.g. "senaite/security.md").
    """
    entries = []
    for label, base in _kb_dirs(wissen_dir, research_dir):
        for md_file in sorted(base.rglob("*.md")):
            rel = md_file.relative_to(base)
            entries.append({
                "path": str(rel),
                "label": label,
                "name": md_file.stem,
                "size": md_file.stat().st_size,
            })
    return entries


def read_file(
    wissen_dir: Path, research_dir: Path, rel_path: str
) -> str | None:
    """Return content of a KB file by relative path, or None."""
    for _label, base in _kb_dirs(wissen_dir, research_dir):
        candidate = base / rel_path
        if candidate.exists() and candidate.is_file():
            return candidate.read_text(encoding="utf-8")
    return None


def search(
    wissen_dir: Path,
    research_dir: Path,
    query: str,
    max_results: int = 20,
) -> list[dict]:
    """Full-text search across KB files.

    Returns up to max_results matches.
    Each dict: {path, label, line_number, snippet}
    """
    if not query.strip():
        return []
    pattern = re.compile(re.escape(query.strip()), re.IGNORECASE)
    results = []
    for label, base in _kb_dirs(wissen_dir, research_dir):
        for md_file in sorted(base.rglob("*.md")):
            rel = str(md_file.relative_to(base))
            try:
                lines = md_file.read_text(
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
