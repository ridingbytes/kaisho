"""Tests for the backup service."""
from datetime import datetime, timedelta
from pathlib import Path
import zipfile

import pytest

from kaisho.services import backup as backup_svc


@pytest.fixture
def source_dir(tmp_path):
    """Create a small fake data directory with nested files."""
    src = tmp_path / "data"
    src.mkdir()
    (src / "a.txt").write_text("alpha", encoding="utf-8")
    (src / "sub").mkdir()
    (src / "sub" / "b.txt").write_text(
        "beta", encoding="utf-8",
    )
    (src / "sub" / "c.md").write_text(
        "# gamma", encoding="utf-8",
    )
    # A "backups" dir at the source root must be skipped
    # to avoid recursive inclusion.
    (src / "backups").mkdir()
    (src / "backups" / "old.zip").write_text(
        "stale", encoding="utf-8",
    )
    return src


def test_create_backup_writes_zip(source_dir, tmp_path):
    """create_backup produces a zip containing the files."""
    target = tmp_path / "out"
    info = backup_svc.create_backup(
        source_dir=source_dir,
        backup_dir=target,
        profile="test",
    )
    assert info.path.exists()
    assert info.path.parent == target
    assert info.profile == "test"
    assert info.size_bytes > 0
    assert info.filename.startswith("kaisho-test-")
    assert info.filename.endswith(".zip")

    with zipfile.ZipFile(info.path) as zf:
        names = set(zf.namelist())
    assert "a.txt" in names
    assert "sub/b.txt" in names
    assert "sub/c.md" in names
    # Backups dir must be excluded so archives don't
    # contain older archives.
    assert not any(
        n.startswith("backups") for n in names
    )


def test_create_backup_missing_source(tmp_path):
    """Missing source_dir raises a clear ValueError."""
    with pytest.raises(ValueError):
        backup_svc.create_backup(
            source_dir=tmp_path / "nope",
            backup_dir=tmp_path / "out",
            profile="test",
        )


def test_list_backups_sorted_newest_first(
    source_dir, tmp_path,
):
    """Listing returns backups newest first."""
    target = tmp_path / "out"
    now = datetime(2026, 4, 16, 12, 0, 0)
    infos = []
    for i in range(3):
        infos.append(
            backup_svc.create_backup(
                source_dir=source_dir,
                backup_dir=target,
                profile="test",
                timestamp=now + timedelta(minutes=i),
            ),
        )
    listed = backup_svc.list_backups(target)
    assert len(listed) == 3
    assert [b.filename for b in listed] == [
        infos[2].filename,
        infos[1].filename,
        infos[0].filename,
    ]


def test_list_backups_ignores_foreign_files(
    source_dir, tmp_path,
):
    """Files that don't match the naming pattern are
    ignored."""
    target = tmp_path / "out"
    target.mkdir()
    (target / "not_a_backup.zip").write_text(
        "x", encoding="utf-8",
    )
    (target / "readme.txt").write_text(
        "hi", encoding="utf-8",
    )
    backup_svc.create_backup(
        source_dir=source_dir,
        backup_dir=target,
        profile="test",
    )
    listed = backup_svc.list_backups(target)
    assert len(listed) == 1


def test_prune_keeps_newest(source_dir, tmp_path):
    """prune_backups deletes the oldest archives."""
    target = tmp_path / "out"
    base = datetime(2026, 1, 1, 0, 0, 0)
    for i in range(5):
        backup_svc.create_backup(
            source_dir=source_dir,
            backup_dir=target,
            profile="test",
            timestamp=base + timedelta(days=i),
        )
    removed = backup_svc.prune_backups(target, keep=2)
    assert len(removed) == 3
    remaining = backup_svc.list_backups(target)
    assert len(remaining) == 2
    # Newest two should survive.
    assert remaining[0].created_at == base + timedelta(
        days=4,
    )
    assert remaining[1].created_at == base + timedelta(
        days=3,
    )


def test_prune_noop_when_below_threshold(
    source_dir, tmp_path,
):
    target = tmp_path / "out"
    backup_svc.create_backup(
        source_dir=source_dir,
        backup_dir=target,
        profile="test",
    )
    removed = backup_svc.prune_backups(target, keep=10)
    assert removed == []


def test_prune_rejects_negative_keep(tmp_path):
    with pytest.raises(ValueError):
        backup_svc.prune_backups(
            tmp_path / "out", keep=-1,
        )


def test_list_backups_missing_dir(tmp_path):
    """Listing an unknown dir returns empty list."""
    assert backup_svc.list_backups(tmp_path / "nope") == []


def test_filename_is_timestamped_and_sortable():
    """Filenames sort lexically in chronological order."""
    name_a = backup_svc._build_filename(
        "p", datetime(2026, 1, 1, 10, 0, 0),
    )
    name_b = backup_svc._build_filename(
        "p", datetime(2026, 1, 1, 10, 5, 0),
    )
    assert name_a < name_b


def test_filename_sanitises_profile():
    """Non-alphanumeric characters in profile are
    replaced so the filename remains safe."""
    name = backup_svc._build_filename(
        "weird/../name", datetime(2026, 1, 1, 0, 0, 0),
    )
    assert Path(name).name == name  # no separators
    assert name.endswith(".zip")
