"""Pull paging: the loop has to end.

Every pull follows the server's ``cursor`` while it says
``has_more``. That terminates only if the cursor actually
moves, and the cursor is the server's to choose. This
client talks to whatever server the user runs, so the
check belongs here.
"""
import pytest

from kaisho.services import cloud_sync as sync_svc


class PagingCloud:
    """A cloud that serves a fixed number of pages."""

    def __init__(self, pages: int, *, advance: bool = True):
        self.pages = pages
        self.advance = advance
        self.calls = 0

    def __call__(self, url, api_key, method="GET", data=None):
        if "/ack" in url:
            return {"acked": 0}
        self.calls += 1
        last = self.calls >= self.pages
        # A minute per page, or a cursor that never moves.
        cursor = (
            f"2026-01-01T00:{self.calls:02d}:00Z"
            if self.advance else "2026-01-01T00:00:00Z"
        )
        return {
            "now": "2026-01-01T00:00:00Z",
            "cursor": cursor,
            "entries": [],
            "has_more": not last,
        }


@pytest.fixture
def stub(monkeypatch):
    def install(cloud):
        monkeypatch.setattr(
            sync_svc, "safe_request", cloud,
        )
        return cloud
    return install


def test_follows_every_page(stub):
    cloud = stub(PagingCloud(4))
    cursor, up, dl = sync_svc.pull_and_apply(
        None, "http://cloud", "k", "1970-01-01T00:00:00Z",
    )
    assert cloud.calls == 4
    assert cursor == "2026-01-01T00:04:00Z"
    assert (up, dl) == (0, 0)


def test_a_stuck_cursor_stops_the_loop(stub):
    """has_more forever, cursor never moves.

    Against the unbounded loop this replaced, a stub like
    this drew 11990 requests in five seconds and was still
    going.
    """
    cloud = stub(PagingCloud(999, advance=False))
    sync_svc.pull_and_apply(
        None, "http://cloud", "k", "1970-01-01T00:00:00Z",
    )
    # Two: the guard can only fire once it has seen the
    # same cursor twice. Two is a stop, not a loop.
    assert cloud.calls == 2


def test_the_page_ceiling_is_a_backstop(stub):
    """A server that advances the cursor but never runs out
    is bounded too, just later."""
    cloud = stub(PagingCloud(10_000))
    sync_svc.pull_and_apply(
        None, "http://cloud", "k", "1970-01-01T00:00:00Z",
    )
    assert cloud.calls == sync_svc.MAX_PULL_PAGES


@pytest.mark.parametrize(
    "puller",
    [
        "pull_and_apply_inbox",
        "pull_and_apply_tasks",
        "pull_and_apply_notes",
        "pull_and_apply_projects",
    ],
)
def test_every_resource_stops_on_a_stuck_cursor(
    stub, puller, tmp_path,
):
    """The same loop is written five times. All five need
    the guard, which is why this is parametrised rather
    than written once for clocks."""
    cloud = stub(PagingCloud(999, advance=False))
    fn = getattr(sync_svc, puller)
    # Projects live outside the pluggable backend, so that
    # one takes a file path where the others take a backend.
    first = (
        tmp_path / "projects.org"
        if puller == "pull_and_apply_projects"
        else _NullBackend()
    )
    fn(first, "http://cloud", "k", "1970-01-01T00:00:00Z")
    assert cloud.calls == 2, f"{puller} kept asking"


class _NullResource:
    """Answers every list call with nothing, whatever the
    caller passes."""

    def __getattr__(self, _name):
        return lambda *a, **kw: []


class _NullBackend:
    inbox = _NullResource()
    tasks = _NullResource()
    notes = _NullResource()
