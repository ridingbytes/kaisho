"""Settings read-modify-write is serialised + atomic.

Concurrent writers to different blocks of the single
settings file used to each load, mutate, and save — the
last writer silently dropping the others' changes. These
tests pin the lock + atomic-write behaviour.
"""
import threading

from kaisho.services import settings as svc


def _path(tmp_path):
    return tmp_path / "settings.yaml"


def test_mutate_settings_persists(tmp_path):
    p = _path(tmp_path)
    svc.mutate_settings(
        p, lambda d: d.update(alpha={"x": 1}),
    )
    data = svc.load_settings(p)
    assert data["alpha"] == {"x": 1}


def test_concurrent_writers_keep_all_updates(tmp_path):
    """Each thread writes its own distinct key. With the
    lock, every key must survive; without it the racing
    read-modify-write would drop most of them."""
    p = _path(tmp_path)
    # Seed the file so every thread loads a real base.
    svc.save_settings(p, {"task_states": [], "tags": []})

    n = 40
    barrier = threading.Barrier(n)

    def writer(i: int) -> None:
        # Line everyone up so the writes genuinely overlap.
        barrier.wait()
        svc.mutate_settings(
            p, lambda d, i=i: d.update({f"key_{i}": i}),
        )

    threads = [
        threading.Thread(target=writer, args=(i,))
        for i in range(n)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    data = svc.load_settings(p)
    for i in range(n):
        assert data[f"key_{i}"] == i, f"lost key_{i}"


def test_save_settings_atomic_cleans_temp_on_error(
    tmp_path, monkeypatch,
):
    """A failure mid-dump must not leave a stray temp file
    or clobber the existing settings."""
    p = _path(tmp_path)
    svc.save_settings(p, {"keep": "me"})

    def boom(*_a, **_kw):
        raise RuntimeError("dump failed")

    monkeypatch.setattr(svc.yaml, "dump", boom)
    try:
        svc.save_settings(p, {"new": "data"})
    except RuntimeError:
        pass

    # Original file intact, no leftover temp files.
    assert svc.load_settings(p) == {"keep": "me"}
    leftovers = list(tmp_path.glob(".settings-*"))
    assert leftovers == []
