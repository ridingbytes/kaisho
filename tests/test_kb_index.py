"""Tests for the central KB metadata index."""
from pathlib import Path

from kaisho.services import kb_index


def _profile(tmp_path: Path) -> Path:
    p = tmp_path / "profile"
    p.mkdir()
    return p


def _files(tmp_path: Path) -> tuple[Path, list]:
    base = tmp_path / "kb"
    base.mkdir()
    (base / "a.md").write_text("alpha", encoding="utf-8")
    (base / "b.md").write_text("beta", encoding="utf-8")
    return base, [
        ("knowledge", base, base / "a.md"),
        ("knowledge", base, base / "b.md"),
    ]


def test_load_returns_empty_when_missing(tmp_path):
    assert kb_index.load_index(_profile(tmp_path)) == []


def test_save_then_load_round_trips(tmp_path):
    profile = _profile(tmp_path)
    rec = kb_index.FileRecord(
        label="knowledge",
        path="x.md",
        hash="abc",
        title="Hello",
        tags=["a", "b"],
        customer="ACME",
    )
    kb_index.save_index(profile, [rec])
    loaded = kb_index.load_index(profile)
    assert len(loaded) == 1
    assert loaded[0].title == "Hello"
    assert loaded[0].tags == ["a", "b"]
    assert loaded[0].customer == "ACME"


def test_save_omits_empty_optional_keys(tmp_path):
    profile = _profile(tmp_path)
    kb_index.save_index(profile, [
        kb_index.FileRecord(
            label="knowledge",
            path="x.md",
            tags=[],
        ),
    ])
    text = kb_index.index_path(profile).read_text("utf-8")
    assert "customer" not in text
    assert "status" not in text
    assert "tags: []" in text


def test_reindex_adds_new_files(tmp_path):
    profile = _profile(tmp_path)
    _, file_iter = _files(tmp_path)
    records, report = kb_index.reindex(
        profile, iter(file_iter), apply=True,
    )
    assert report.added == 2
    assert report.unchanged == 0
    assert {r.path for r in records} == {"a.md", "b.md"}
    assert all(r.hash for r in records)


def test_reindex_marks_unchanged_files(tmp_path):
    profile = _profile(tmp_path)
    _, file_iter = _files(tmp_path)
    kb_index.reindex(profile, iter(file_iter), apply=True)
    _, report = kb_index.reindex(
        profile, iter(file_iter), apply=True,
    )
    assert report.unchanged == 2
    assert report.added == 0


def test_reindex_detects_rename(tmp_path):
    profile = _profile(tmp_path)
    base, file_iter = _files(tmp_path)
    # Initial pass + tag a.md.
    records, _ = kb_index.reindex(
        profile, iter(file_iter), apply=False,
    )
    a = kb_index.lookup(records, "knowledge", "a.md")
    assert a is not None
    a.tags = ["alpha"]
    kb_index.save_index(profile, records)

    # Move a.md → renamed.md, scan again.
    (base / "a.md").rename(base / "renamed.md")
    new_iter = [
        ("knowledge", base, base / "renamed.md"),
        ("knowledge", base, base / "b.md"),
    ]
    records, report = kb_index.reindex(
        profile, iter(new_iter), apply=True,
    )
    assert report.renamed == 1
    a_after = kb_index.lookup(
        records, "knowledge", "renamed.md",
    )
    assert a_after is not None
    assert a_after.tags == ["alpha"]


def test_reindex_prunes_missing_files(tmp_path):
    profile = _profile(tmp_path)
    base, file_iter = _files(tmp_path)
    kb_index.reindex(profile, iter(file_iter), apply=True)
    (base / "a.md").unlink()
    new_iter = [("knowledge", base, base / "b.md")]
    records, report = kb_index.reindex(
        profile, iter(new_iter), apply=True,
    )
    assert {r.path for r in records} == {"b.md"}
    assert report.pruned == 1


def test_update_metadata_creates_record(tmp_path):
    records: list[kb_index.FileRecord] = []
    rec = kb_index.update_metadata(
        records, "knowledge", "x.md",
        {"tags": ["a"], "title": "X"},
    )
    assert rec.tags == ["a"]
    assert rec.title == "X"
    assert rec.indexed_at  # set


def test_update_metadata_clears_optional_with_none():
    records = [
        kb_index.FileRecord(
            label="knowledge", path="x.md",
            customer="ACME",
        ),
    ]
    kb_index.update_metadata(
        records, "knowledge", "x.md", {"customer": None},
    )
    assert records[0].customer is None


def test_list_tags_unique_sorted():
    records = [
        kb_index.FileRecord(
            label="knowledge", path="a.md",
            tags=["c", "a"],
        ),
        kb_index.FileRecord(
            label="knowledge", path="b.md",
            tags=["a", "b"],
        ),
    ]
    assert kb_index.list_tags(records) == ["a", "b", "c"]


def test_import_frontmatter_copies_keys(tmp_path):
    profile = _profile(tmp_path)
    base = tmp_path / "kb"
    base.mkdir()
    (base / "a.md").write_text(
        "---\n"
        "title: Hello\n"
        "tags: [x, y]\n"
        "---\n"
        "body\n",
        encoding="utf-8",
    )
    records, count = kb_index.import_frontmatter(
        profile,
        [("knowledge", base, base / "a.md")],
        apply=True,
    )
    assert count == 1
    rec = kb_index.lookup(records, "knowledge", "a.md")
    assert rec is not None
    assert rec.title == "Hello"
    assert rec.tags == ["x", "y"]


def test_import_frontmatter_preserves_existing_index_values(tmp_path):
    profile = _profile(tmp_path)
    base = tmp_path / "kb"
    base.mkdir()
    (base / "a.md").write_text(
        "---\ntitle: From File\ntags: [old]\n---\n",
        encoding="utf-8",
    )
    # Pre-existing index value; import should not clobber.
    kb_index.save_index(profile, [
        kb_index.FileRecord(
            label="knowledge", path="a.md",
            title="From UI", tags=["new"],
        ),
    ])
    records, _ = kb_index.import_frontmatter(
        profile,
        [("knowledge", base, base / "a.md")],
        apply=True,
    )
    rec = kb_index.lookup(records, "knowledge", "a.md")
    assert rec is not None
    assert rec.title == "From UI"
    assert rec.tags == ["new"]


def test_import_frontmatter_skips_files_without_frontmatter(tmp_path):
    profile = _profile(tmp_path)
    base = tmp_path / "kb"
    base.mkdir()
    (base / "a.md").write_text("# Heading\nbody", "utf-8")
    records, count = kb_index.import_frontmatter(
        profile,
        [("knowledge", base, base / "a.md")],
        apply=False,
    )
    assert count == 0
    assert records == []


def test_save_is_atomic(tmp_path):
    profile = _profile(tmp_path)
    kb_index.save_index(profile, [
        kb_index.FileRecord(label="knowledge", path="x.md"),
    ])
    # No leftover .tmp file
    assert not (
        kb_index.index_path(profile).with_suffix(".yaml.tmp")
    ).exists()


def test_reindex_does_not_collapse_duplicate_hash_renames(tmp_path):
    """Two new files with identical content shouldn't both
    inherit the same orphan's metadata."""
    profile = _profile(tmp_path)
    base = tmp_path / "kb"
    base.mkdir()
    (base / "a.md").write_text("same", encoding="utf-8")
    file_iter = [("knowledge", base, base / "a.md")]
    records, _ = kb_index.reindex(
        profile, iter(file_iter), apply=False,
    )
    a = kb_index.lookup(records, "knowledge", "a.md")
    a.tags = ["only-on-a"]
    kb_index.save_index(profile, records)

    # Replace a.md with two identical-content files; the
    # original goes "missing" and matches *both* -- but
    # we shouldn't reattach to either ambiguously.
    (base / "a.md").unlink()
    (base / "x.md").write_text("same", encoding="utf-8")
    (base / "y.md").write_text("same", encoding="utf-8")
    new_iter = [
        ("knowledge", base, base / "x.md"),
        ("knowledge", base, base / "y.md"),
    ]
    records, report = kb_index.reindex(
        profile, iter(new_iter), apply=True,
    )
    assert report.renamed == 0
    assert report.added == 2
    assert report.pruned == 1
    for path in ("x.md", "y.md"):
        rec = kb_index.lookup(records, "knowledge", path)
        assert rec is not None
        assert rec.tags == []  # not inherited


def test_reindex_pruned_count_correct_when_hash_survives(tmp_path):
    """Two unrelated files with identical content: deleting
    one should still count as pruned."""
    profile = _profile(tmp_path)
    base = tmp_path / "kb"
    base.mkdir()
    (base / "a.md").write_text("same", encoding="utf-8")
    (base / "b.md").write_text("same", encoding="utf-8")
    file_iter = [
        ("knowledge", base, base / "a.md"),
        ("knowledge", base, base / "b.md"),
    ]
    kb_index.reindex(profile, iter(file_iter), apply=True)
    (base / "a.md").unlink()
    new_iter = [("knowledge", base, base / "b.md")]
    records, report = kb_index.reindex(
        profile, iter(new_iter), apply=True,
    )
    assert report.pruned == 1
    assert {r.path for r in records} == {"b.md"}


def test_update_metadata_with_empty_patch_is_noop():
    records = [
        kb_index.FileRecord(
            label="w", path="a.md",
            tags=["x"], indexed_at="OLD",
        ),
    ]
    rec = kb_index.update_metadata(
        records, "w", "a.md", {},
    )
    assert rec.tags == ["x"]
    assert rec.indexed_at == "OLD"


def test_index_lock_serializes_concurrent_writes(tmp_path):
    """A reindex in flight must not lose a concurrent
    metadata patch. The lock guarantees one atomic
    load->mutate->save sequence at a time."""
    import threading
    profile = _profile(tmp_path)
    base = tmp_path / "kb"
    base.mkdir()
    (base / "a.md").write_text("alpha", encoding="utf-8")
    file_iter = [("knowledge", base, base / "a.md")]
    kb_index.reindex(profile, iter(file_iter), apply=True)

    barrier = threading.Barrier(2)

    def patch_metadata():
        barrier.wait()
        with kb_index.INDEX_LOCK:
            records = kb_index.load_index(profile)
            kb_index.update_metadata(
                records, "knowledge", "a.md",
                {"tags": ["from-patch"]},
            )
            kb_index.save_index(profile, records)

    def run_reindex():
        barrier.wait()
        kb_index.reindex(
            profile, iter(file_iter), apply=True,
        )

    t1 = threading.Thread(target=patch_metadata)
    t2 = threading.Thread(target=run_reindex)
    t1.start(); t2.start()
    t1.join(); t2.join()
    rec = kb_index.lookup(
        kb_index.load_index(profile), "knowledge", "a.md",
    )
    # The patch must survive whichever order ran.
    assert rec is not None
    assert rec.tags == ["from-patch"]


def test_rename_tag_replaces_across_records(tmp_path):
    profile = _profile(tmp_path)
    kb_index.save_index(profile, [
        kb_index.FileRecord(
            label="w", path="a.md", tags=["debian", "linux"],
        ),
        kb_index.FileRecord(
            label="w", path="b.md", tags=["ansible", "debian"],
        ),
        kb_index.FileRecord(
            label="w", path="c.md", tags=["macos"],
        ),
    ])
    result = kb_index.rename_tag(
        profile, "debian", "deb",
    )
    assert result == {"renamed": 2, "merged": 0}
    records = kb_index.load_index(profile)
    by_path = {r.path: r.tags for r in records}
    assert by_path["a.md"] == ["deb", "linux"]
    assert by_path["b.md"] == ["ansible", "deb"]
    assert by_path["c.md"] == ["macos"]


def test_rename_tag_merges_into_existing(tmp_path):
    profile = _profile(tmp_path)
    kb_index.save_index(profile, [
        kb_index.FileRecord(
            label="w", path="a.md", tags=["debian", "linux"],
        ),
        kb_index.FileRecord(
            label="w", path="b.md", tags=["debian"],
        ),
    ])
    result = kb_index.rename_tag(
        profile, "debian", "linux",
    )
    assert result == {"renamed": 1, "merged": 1}
    records = kb_index.load_index(profile)
    by_path = {r.path: r.tags for r in records}
    # a.md already had linux: debian gets dropped (merge)
    assert by_path["a.md"] == ["linux"]
    # b.md had only debian: rename in place
    assert by_path["b.md"] == ["linux"]


def test_rename_tag_rejects_empty_or_identical():
    import pytest
    with pytest.raises(ValueError):
        kb_index.rename_tag(Path("/tmp"), "", "x")
    with pytest.raises(ValueError):
        kb_index.rename_tag(Path("/tmp"), "x", "")
    with pytest.raises(ValueError):
        kb_index.rename_tag(Path("/tmp"), "x", "x")


def test_rename_tag_noop_when_tag_absent(tmp_path):
    profile = _profile(tmp_path)
    kb_index.save_index(profile, [
        kb_index.FileRecord(
            label="w", path="a.md", tags=["alpha"],
        ),
    ])
    before = kb_index.index_path(profile).stat().st_mtime_ns
    result = kb_index.rename_tag(
        profile, "missing", "other",
    )
    after = kb_index.index_path(profile).stat().st_mtime_ns
    assert result == {"renamed": 0, "merged": 0}
    # No save when nothing changed.
    assert before == after
