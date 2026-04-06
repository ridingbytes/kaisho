"""Tests for the knowledge service."""
from pathlib import Path

from omnicontrol.services.knowledge import (
    file_tree, read_file, search,
)


def _make_sources(tmp_path: Path) -> list[dict]:
    wissen = tmp_path / "wissen"
    research = tmp_path / "research"
    wissen.mkdir()
    research.mkdir()
    (wissen / "notes.md").write_text(
        "# Notes\n\nSome important content here.",
        encoding="utf-8",
    )
    (wissen / "guide.md").write_text(
        "# Guide\n\nStep by step instructions.",
        encoding="utf-8",
    )
    (research / "report.md").write_text(
        "# Report\n\nResearch findings.",
        encoding="utf-8",
    )
    return [
        {"label": "wissen", "path": str(wissen)},
        {"label": "research", "path": str(research)},
    ]


def test_file_tree_lists_all_files(tmp_path):
    sources = _make_sources(tmp_path)
    files = file_tree(sources)
    names = [f["name"] for f in files]
    assert "notes" in names
    assert "guide" in names
    assert "report" in names


def test_file_tree_labels(tmp_path):
    sources = _make_sources(tmp_path)
    files = file_tree(sources)
    by_name = {f["name"]: f["label"] for f in files}
    assert by_name["notes"] == "wissen"
    assert by_name["report"] == "research"


def test_file_tree_empty_dirs(tmp_path):
    wissen = tmp_path / "wissen"
    research = tmp_path / "research"
    wissen.mkdir()
    research.mkdir()
    sources = [
        {"label": "wissen", "path": str(wissen)},
        {"label": "research", "path": str(research)},
    ]
    assert file_tree(sources) == []


def test_read_file_returns_content(tmp_path):
    sources = _make_sources(tmp_path)
    content = read_file(sources, "notes.md")
    assert content is not None
    assert "important content" in content


def test_read_file_missing_returns_none(tmp_path):
    sources = _make_sources(tmp_path)
    assert read_file(sources, "ghost.md") is None


def test_search_finds_keyword(tmp_path):
    sources = _make_sources(tmp_path)
    results = search(sources, "important")
    assert len(results) >= 1
    assert any("notes" in r["path"] for r in results)


def test_search_no_match(tmp_path):
    sources = _make_sources(tmp_path)
    results = search(sources, "xyznotfound")
    assert results == []


def test_search_across_both_dirs(tmp_path):
    sources = _make_sources(tmp_path)
    results = search(sources, "findings")
    assert any(r["label"] == "research" for r in results)
