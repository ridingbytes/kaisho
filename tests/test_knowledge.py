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


def test_search_caps_distinct_files(tmp_path):
    """``max_files`` limits distinct files in the result,
    not raw line hits."""
    src = tmp_path / "kb"
    src.mkdir()
    for i in range(5):
        (src / f"f{i}.md").write_text(
            "screen\nscreen again\n",
            encoding="utf-8",
        )
    sources = [{"label": "kb", "path": str(src)}]
    results = search(sources, "screen", max_files=3)
    paths = {r["path"] for r in results}
    assert len(paths) == 3


def test_search_caps_hits_per_file(tmp_path):
    """``max_hits_per_file`` limits lines surfaced from a
    single file."""
    src = tmp_path / "kb"
    src.mkdir()
    (src / "noisy.md").write_text(
        "\n".join(["screen"] * 30) + "\n",
        encoding="utf-8",
    )
    sources = [{"label": "kb", "path": str(src)}]
    results = search(
        sources, "screen",
        max_files=10, max_hits_per_file=4,
    )
    assert len(results) == 4


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


# -- copy_file / move_folder / copy_folder ------------------

def test_copy_file_within_source(tmp_path):
    from kaisho.services.knowledge import copy_file
    sources = _make_sources(tmp_path)
    out = copy_file(
        sources, "notes.md", "wissen", "wissen",
        new_path="archive/notes.md",
    )
    assert out["path"] == "archive/notes.md"
    # Original still there, copy created.
    assert (tmp_path / "wissen" / "notes.md").exists()
    assert (
        tmp_path / "wissen" / "archive" / "notes.md"
    ).exists()


def test_copy_file_across_sources(tmp_path):
    from kaisho.services.knowledge import copy_file
    sources = _make_sources(tmp_path)
    copy_file(
        sources, "notes.md", "wissen", "research",
        new_path="notes.md",
    )
    assert (tmp_path / "wissen" / "notes.md").exists()
    assert (tmp_path / "research" / "notes.md").exists()


def test_copy_file_refuses_overwrite(tmp_path):
    from kaisho.services.knowledge import copy_file
    sources = _make_sources(tmp_path)
    with pytest.raises(ValueError, match="already exists"):
        copy_file(
            sources, "notes.md", "wissen", "wissen",
            new_path="guide.md",
        )


def test_move_folder(tmp_path):
    from kaisho.services.knowledge import move_folder
    sources = _make_sources(tmp_path)
    sub = tmp_path / "wissen" / "topic"
    sub.mkdir()
    (sub / "a.md").write_text("# A", encoding="utf-8")
    move_folder(
        sources, "topic", "wissen", "research", "topic",
    )
    assert not (tmp_path / "wissen" / "topic").exists()
    assert (
        tmp_path / "research" / "topic" / "a.md"
    ).exists()


def test_copy_folder(tmp_path):
    from kaisho.services.knowledge import copy_folder
    sources = _make_sources(tmp_path)
    sub = tmp_path / "wissen" / "topic"
    sub.mkdir()
    (sub / "a.md").write_text("# A", encoding="utf-8")
    copy_folder(
        sources, "topic", "wissen", "wissen",
        "archive/topic",
    )
    assert (tmp_path / "wissen" / "topic" / "a.md").exists()
    assert (
        tmp_path / "wissen" / "archive" / "topic" / "a.md"
    ).exists()


def test_copy_folder_refuses_overwrite(tmp_path):
    from kaisho.services.knowledge import copy_folder
    sources = _make_sources(tmp_path)
    (tmp_path / "wissen" / "topic").mkdir()
    (tmp_path / "research" / "topic").mkdir()
    with pytest.raises(ValueError, match="already exists"):
        copy_folder(
            sources, "topic", "wissen", "research", "topic",
        )


def test_delete_folder(tmp_path):
    from kaisho.services.knowledge import delete_folder
    sources = _make_sources(tmp_path)
    sub = tmp_path / "wissen" / "topic"
    sub.mkdir()
    (sub / "a.md").write_text("# A", encoding="utf-8")
    assert delete_folder(sources, "topic") is True
    assert not (tmp_path / "wissen" / "topic").exists()


def test_delete_empty_folder(tmp_path):
    from kaisho.services.knowledge import delete_folder
    sources = _make_sources(tmp_path)
    (tmp_path / "wissen" / "empty").mkdir()
    assert delete_folder(sources, "empty") is True
    assert not (tmp_path / "wissen" / "empty").exists()


def test_delete_folder_missing(tmp_path):
    from kaisho.services.knowledge import delete_folder
    sources = _make_sources(tmp_path)
    assert delete_folder(sources, "nope") is False


def test_delete_folder_refuses_root(tmp_path):
    from kaisho.services.knowledge import delete_folder
    sources = _make_sources(tmp_path)
    with pytest.raises(ValueError, match="source root"):
        delete_folder(sources, "")
    # The source directory is untouched.
    assert (tmp_path / "wissen").exists()


def test_move_file_refuses_overwrite(tmp_path):
    from kaisho.services.knowledge import move_file
    sources = _make_sources(tmp_path)
    # notes.md and guide.md both exist in wissen; moving
    # notes onto guide must not clobber guide.
    with pytest.raises(ValueError, match="already exists"):
        move_file(
            sources, "notes.md", "wissen", "wissen",
            new_path="guide.md",
        )
    assert (
        tmp_path / "wissen" / "guide.md"
    ).read_text() == "# Guide\n\nStep by step instructions."
    # The source file is untouched.
    assert (tmp_path / "wissen" / "notes.md").exists()


def test_move_file_into_folder(tmp_path):
    from kaisho.services.knowledge import move_file
    sources = _make_sources(tmp_path)
    move_file(
        sources, "notes.md", "wissen", "wissen",
        new_path="sub/notes.md",
    )
    assert not (tmp_path / "wissen" / "notes.md").exists()
    assert (
        tmp_path / "wissen" / "sub" / "notes.md"
    ).exists()
