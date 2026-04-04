"""Tests for the knowledge service."""
from pathlib import Path

from omnicontrol.services.knowledge import file_tree, read_file, search


def _make_kb(tmp_path: Path) -> tuple[Path, Path]:
    wissen = tmp_path / "wissen"
    research = tmp_path / "research"
    wissen.mkdir()
    research.mkdir()
    (wissen / "notes.md").write_text(
        "# Notes\n\nSome important content here.", encoding="utf-8"
    )
    (wissen / "guide.md").write_text(
        "# Guide\n\nStep by step instructions.", encoding="utf-8"
    )
    (research / "report.md").write_text(
        "# Report\n\nResearch findings.", encoding="utf-8"
    )
    return wissen, research


def test_file_tree_lists_all_files(tmp_path):
    wissen, research = _make_kb(tmp_path)
    files = file_tree(wissen, research)
    # name is the stem (without extension)
    names = [f["name"] for f in files]
    assert "notes" in names
    assert "guide" in names
    assert "report" in names


def test_file_tree_labels(tmp_path):
    wissen, research = _make_kb(tmp_path)
    files = file_tree(wissen, research)
    by_name = {f["name"]: f["label"] for f in files}
    assert by_name["notes"] == "wissen"
    assert by_name["report"] == "research"


def test_file_tree_empty_dirs(tmp_path):
    wissen = tmp_path / "wissen"
    research = tmp_path / "research"
    wissen.mkdir()
    research.mkdir()
    assert file_tree(wissen, research) == []


def test_read_file_returns_content(tmp_path):
    wissen, research = _make_kb(tmp_path)
    # path is relative to base dir, no label prefix
    content = read_file(wissen, research, "notes.md")
    assert content is not None
    assert "important content" in content


def test_read_file_missing_returns_none(tmp_path):
    wissen, research = _make_kb(tmp_path)
    assert read_file(wissen, research, "ghost.md") is None


def test_search_finds_keyword(tmp_path):
    wissen, research = _make_kb(tmp_path)
    results = search(wissen, research, "important")
    assert len(results) >= 1
    assert any("notes" in r["path"] for r in results)


def test_search_no_match(tmp_path):
    wissen, research = _make_kb(tmp_path)
    results = search(wissen, research, "xyznotfound")
    assert results == []


def test_search_across_both_dirs(tmp_path):
    wissen, research = _make_kb(tmp_path)
    results = search(wissen, research, "findings")
    assert any(r["label"] == "research" for r in results)
