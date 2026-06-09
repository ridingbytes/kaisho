"""Concurrent-writer regression tests for write_org_file.

The previous atomic-write implementation shared a single
``<path>.tmp`` scratch file across all callers, so two
concurrent writers raced and the loser hit
``FileNotFoundError`` when its ``os.replace`` ran after
the winner already consumed the tmp.

Reproduced in production at
``kaisho/org/writer.py:102`` via
``GET /api/kanban/tasks`` ↔ background sync writing
``todos.org`` simultaneously.
"""
import threading

from kaisho.org.models import Heading, OrgFile
from kaisho.org.writer import write_org_file


def _build(title: str) -> OrgFile:
    heading = Heading(
        level=1,
        keyword="TODO",
        title=title,
        properties={"ID": "abc"},
    )
    return OrgFile(headings=[heading])


def test_concurrent_writes_do_not_raise(tmp_path):
    """Two threads writing the same path concurrently must
    both complete cleanly. The final file holds one of the
    two payloads (last-writer-wins by ``os.replace`` race),
    which is the contract atomic-replace already gives at
    the OS level — what matters is that neither writer
    crashes."""
    target = tmp_path / "todos.org"
    a = _build("A")
    b = _build("B")
    errors: list[BaseException] = []

    def write(org: OrgFile) -> None:
        try:
            write_org_file(target, org)
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [
        threading.Thread(target=write, args=(a,)),
        threading.Thread(target=write, args=(b,)),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)
    assert not errors, errors

    content = target.read_text("utf-8")
    assert "A" in content or "B" in content


def test_no_tmp_file_left_behind(tmp_path):
    """A successful write leaves no ``.tmp`` litter next to
    the target. Catches regressions where the unique-tmp
    fix forgets to remove its scratch on the success
    path."""
    target = tmp_path / "todos.org"
    for _ in range(5):
        write_org_file(target, _build("X"))
    leftovers = [
        p for p in tmp_path.iterdir()
        if p.name != "todos.org"
    ]
    assert leftovers == [], (
        f"unexpected leftover files: {leftovers}"
    )


def test_many_concurrent_writes(tmp_path):
    """Stress: 20 concurrent writers, none should crash."""
    target = tmp_path / "stress.org"
    errors: list[BaseException] = []

    def write(label: str) -> None:
        try:
            write_org_file(target, _build(label))
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [
        threading.Thread(target=write, args=(f"L{i}",))
        for i in range(20)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)
    assert not errors, errors
    assert target.exists()
    # No tmp scratch left over.
    leftovers = [
        p for p in tmp_path.iterdir()
        if p.name != "stress.org"
    ]
    assert leftovers == [], leftovers
