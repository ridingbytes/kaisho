"""Tests for the knowledge service."""
from pathlib import Path

import pytest

from kaisho.services import kb_index
from kaisho.services.knowledge import (
    file_tree,
    get_metadata,
    list_tags,
    read_file,
    search,
    update_metadata,
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


def _profile(tmp_path: Path) -> Path:
    p = tmp_path / "profile"
    p.mkdir()
    return p


def test_file_tree_lists_all_files(tmp_path):
    sources = _make_sources(tmp_path)
    files = file_tree(sources, _profile(tmp_path))
    names = [f["name"] for f in files]
    assert "notes" in names
    assert "guide" in names
    assert "report" in names


def test_file_tree_labels(tmp_path):
    sources = _make_sources(tmp_path)
    files = file_tree(sources, _profile(tmp_path))
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
    assert file_tree(sources, _profile(tmp_path)) == []


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


def test_search_paths_filter(tmp_path):
    sources = _make_sources(tmp_path)
    results = search(
        sources, "step", paths=["guide.md"],
    )
    assert all(r["path"] == "guide.md" for r in results)


def test_search_empty_paths_filter(tmp_path):
    sources = _make_sources(tmp_path)
    assert search(sources, "step", paths=[]) == []


# ---------------------------------------------------------------------------
# Index-backed metadata
# ---------------------------------------------------------------------------


def _seeded_profile(tmp_path: Path) -> Path:
    profile = _profile(tmp_path)
    kb_index.save_index(profile, [
        kb_index.FileRecord(
            label="wissen",
            path="notes.md",
            title="Notes",
            tags=["a", "b"],
            customer="ACME",
        ),
    ])
    return profile


def test_get_metadata_returns_indexed_dict(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _seeded_profile(tmp_path)
    meta = get_metadata(sources, profile, "notes.md")
    assert meta == {
        "title": "Notes",
        "tags": ["a", "b"],
        "customer": "ACME",
    }


def test_get_metadata_empty_for_unknown_file(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _profile(tmp_path)
    meta = get_metadata(sources, profile, "guide.md")
    assert meta == {"title": "", "tags": []}


def test_get_metadata_missing_file_returns_none(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _profile(tmp_path)
    assert get_metadata(sources, profile, "ghost.md") is None


def test_update_metadata_writes_to_index(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _profile(tmp_path)
    out = update_metadata(
        sources, profile, "notes.md",
        {"tags": ["x", "y"], "customer": "ACME"},
    )
    assert out["tags"] == ["x", "y"]
    assert out["customer"] == "ACME"
    again = get_metadata(sources, profile, "notes.md")
    assert again == out


def test_update_metadata_does_not_modify_file(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _profile(tmp_path)
    notes = Path(sources[0]["path"]) / "notes.md"
    before = notes.read_text(encoding="utf-8")
    update_metadata(
        sources, profile, "notes.md", {"tags": ["x"]},
    )
    assert notes.read_text(encoding="utf-8") == before


def test_update_metadata_rejects_path_traversal(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _profile(tmp_path)
    with pytest.raises(ValueError):
        update_metadata(
            sources, profile, "../secret.md", {"title": "x"},
        )


def test_get_metadata_rejects_path_traversal(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _profile(tmp_path)
    assert (
        get_metadata(sources, profile, "../secret.md")
        is None
    )


def test_list_tags_reads_from_index(tmp_path):
    profile = _profile(tmp_path)
    kb_index.save_index(profile, [
        kb_index.FileRecord(
            label="w", path="a.md", tags=["c", "a"],
        ),
        kb_index.FileRecord(
            label="w", path="b.md", tags=["a", "b"],
        ),
    ])
    assert list_tags(profile) == ["a", "b", "c"]


def test_file_tree_enriches_from_index(tmp_path):
    sources = _make_sources(tmp_path)
    profile = _seeded_profile(tmp_path)
    files = file_tree(sources, profile)
    notes = next(f for f in files if f["name"] == "notes")
    assert notes["title"] == "Notes"
    assert notes["tags"] == ["a", "b"]
    guide = next(f for f in files if f["name"] == "guide")
    assert guide["tags"] == []
