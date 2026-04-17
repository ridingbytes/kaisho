"""Bidirectional cloud-sync protocol tests.

Exercises the local side against a stubbed cloud. We
don't hit the network — requests are monkey-patched to a
fake in-memory cloud so the LWW / tombstone / active-timer
rules are verifiable in isolation.
"""
from datetime import datetime
from pathlib import Path

import pytest

from kaisho.backends.org.clocks import OrgClockBackend
from kaisho.services import clocks as clocks_svc
from kaisho.services import cloud_sync as sync_svc
from kaisho.services import sync_state


# ── Fake cloud ────────────────────────────────────────


class FakeCloud:
    """In-memory stand-in for the cloud /sync endpoints."""

    def __init__(self):
        self.entries: dict[str, dict] = {}
        self.applied_calls: list[dict] = []

    def changes(self, since: str) -> dict:
        out = [
            e for e in self.entries.values()
            if e["updated_at"] > since
        ]
        out.sort(key=lambda e: e["updated_at"])
        cursor = (
            out[-1]["updated_at"]
            if out else since
        )
        return {
            "now": datetime.now().isoformat(),
            "cursor": cursor,
            "entries": [self._wire(e) for e in out],
            "has_more": False,
        }

    def apply(self, payload: dict) -> dict:
        counts = {
            "inserted": 0, "updated": 0,
            "skipped": 0, "errors": 0,
        }
        for entry in payload["entries"]:
            sid = entry["id"]
            existing = self.entries.get(sid)
            if existing and (
                entry["updated_at"]
                <= existing["updated_at"]
            ):
                counts["skipped"] += 1
                continue
            if existing:
                counts["updated"] += 1
            else:
                counts["inserted"] += 1
            self.entries[sid] = {**entry}
        self.applied_calls.append(payload)
        return counts

    def _wire(self, e: dict) -> dict:
        return {
            "id": e["id"],
            "customer": e.get("customer"),
            "description": e.get("description", ""),
            "start": e["start"],
            "end": e.get("end"),
            "task_id": e.get("task_id"),
            "contract": e.get("contract"),
            "notes": e.get("notes", ""),
            "invoiced": bool(e.get("invoiced")),
            "updated_at": e["updated_at"],
            "deleted_at": e.get("deleted_at"),
        }


@pytest.fixture
def fake_cloud(monkeypatch):
    cloud = FakeCloud()

    def fake_pull(url, key, since, limit=200):
        return cloud.changes(since)

    def fake_push(url, key, entries):
        return cloud.apply({"entries": entries})

    def fake_start_active(url, key, payload):
        # Reconcile against any existing active.
        running_ids = [
            sid for sid, e in cloud.entries.items()
            if e.get("end") is None
            and not e.get("deleted_at")
        ]
        for sid in running_ids:
            existing = cloud.entries[sid]
            if existing["id"] == payload["id"]:
                return {
                    "active": True,
                    "winner": "existing",
                    **existing,
                }
            if payload["start"] <= existing["start"]:
                return {
                    "active": True,
                    "winner": "existing",
                    **existing,
                }
            existing["end"] = payload["start"]
            existing["updated_at"] = payload["start"]
        cloud.entries[payload["id"]] = {
            "id": payload["id"],
            "customer": payload.get("customer"),
            "description": payload.get(
                "description", "",
            ),
            "start": payload["start"],
            "end": None,
            "task_id": payload.get("task_id"),
            "contract": payload.get("contract"),
            "notes": "",
            "invoiced": False,
            "updated_at": payload["start"],
            "deleted_at": None,
        }
        return {
            "active": True, "winner": "incoming",
            **cloud.entries[payload["id"]],
        }

    monkeypatch.setattr(
        sync_svc, "pull_changes", fake_pull,
    )
    monkeypatch.setattr(
        sync_svc, "push_changes", fake_push,
    )
    monkeypatch.setattr(
        sync_svc, "start_active", fake_start_active,
    )
    # Neutralize the reference-data snapshot path; it's
    # not exercised by these tests.
    monkeypatch.setattr(
        sync_svc, "push_reference_snapshot",
        lambda *a, **kw: False,
    )
    return cloud


@pytest.fixture
def profile_dir(tmp_path: Path) -> Path:
    d = tmp_path / "profile"
    d.mkdir()
    return d


@pytest.fixture
def clocks_file(profile_dir: Path) -> Path:
    f = profile_dir / "clocks.org"
    f.write_text("", encoding="utf-8")
    return f


@pytest.fixture
def backend(clocks_file: Path):
    return OrgClockBackend(clocks_file)


@pytest.fixture
def patched_backend(monkeypatch, backend):
    class StubBackend:
        pass

    stub = StubBackend()
    stub.clocks = backend

    def fake_get_backend():
        return stub

    # cloud_sync imports kaisho.backends.get_backend lazily
    # inside the cycle; patch at that access path.
    monkeypatch.setattr(
        "kaisho.backends.get_backend", fake_get_backend,
    )
    return stub


# ── Tests: identity backfill ──────────────────────────


class TestIdentityBackfill:
    def test_start_stamps_sync_id(self, backend):
        entry = backend.start(
            customer="Acme", description="hack",
        )
        assert entry["sync_id"]
        assert entry["updated_at"]

    def test_quick_book_stamps_sync_id(self, backend):
        entry = backend.quick_book(
            duration_str="30m",
            customer="Acme", description="",
        )
        assert entry["sync_id"]
        assert entry["updated_at"]

    def test_backfill_on_read(self, clocks_file, backend):
        # Simulate a pre-existing entry without SYNC_ID.
        clocks_file.write_text(
            "* [2026-04-16 Thu] [Acme]: work\n"
            "  :LOGBOOK:\n"
            "  CLOCK: [2026-04-16 Thu 09:00]--"
            "[2026-04-16 Thu 10:00] =>  1:00\n"
            "  :END:\n",
            encoding="utf-8",
        )
        entries = backend.list_entries(period="all")
        assert len(entries) == 1
        assert entries[0]["sync_id"]
        assert entries[0]["updated_at"]
        # Second read should see the backfilled UUID.
        entries2 = backend.list_entries(period="all")
        assert entries[0]["sync_id"] == entries2[0]["sync_id"]


# ── Tests: push / pull round-trip ─────────────────────


class TestSyncCycle:
    def test_local_entry_pushes_up(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        backend.quick_book(
            duration_str="1h",
            customer="Acme", description="bill",
        )
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        assert len(fake_cloud.entries) == 1

    def test_cloud_entry_pulls_down(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        # Seed the cloud.
        fake_cloud.entries["abc"] = {
            "id": "abc",
            "customer": "Beta",
            "description": "",
            "start": "2026-04-15T10:00:00",
            "end": "2026-04-15T11:00:00",
            "task_id": None,
            "contract": None,
            "notes": "",
            "invoiced": False,
            "updated_at": "2026-04-15T11:00:00",
            "deleted_at": None,
        }
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        entries = backend.list_entries(period="all")
        assert len(entries) == 1
        assert entries[0]["customer"] == "Beta"
        assert entries[0]["sync_id"] == "abc"

    def test_pulled_entry_does_not_push_back(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        fake_cloud.entries["abc"] = {
            "id": "abc",
            "customer": "Beta",
            "description": "",
            "start": "2026-04-15T10:00:00",
            "end": "2026-04-15T11:00:00",
            "task_id": None,
            "contract": None,
            "notes": "",
            "invoiced": False,
            "updated_at": "2026-04-15T11:00:00",
            "deleted_at": None,
        }
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        # The pull should not create an echo push of the
        # entry back to the cloud.
        all_pushes = sum(
            len(p["entries"])
            for p in fake_cloud.applied_calls
        )
        assert all_pushes == 0


# ── Tests: LWW ────────────────────────────────────────


class TestActiveTimerRouting:
    def test_local_running_timer_uses_active_start(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        backend.start(
            customer="Acme", description="live",
        )
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        # A single running entry should appear on the cloud
        # and `push_changes` should not have been used for
        # running entries (applied_calls empty or list of
        # empty batches).
        assert any(
            e.get("end") is None
            for e in fake_cloud.entries.values()
        )
        pushed_via_apply = sum(
            len(p["entries"])
            for p in fake_cloud.applied_calls
        )
        assert pushed_via_apply == 0

    def test_running_timer_idempotent_push(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        backend.start(
            customer="Acme", description="live",
        )
        for _ in range(3):
            sync_svc.run_sync_cycle(
                cloud_url="http://fake",
                api_key="key",
                profile_dir=profile_dir,
                clocks_file=backend.data_file,
            )
        # Only one active entry on the cloud.
        running = [
            e for e in fake_cloud.entries.values()
            if e.get("end") is None
        ]
        assert len(running) == 1

    def test_stop_propagates_through_apply(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        backend.start(customer="Acme", description="")
        sync_svc.run_sync_cycle(
            cloud_url="http://fake", api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        backend.stop()
        sync_svc.run_sync_cycle(
            cloud_url="http://fake", api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        running = [
            e for e in fake_cloud.entries.values()
            if e.get("end") is None
        ]
        assert len(running) == 0


class TestSyncIdAdoption:
    """When a user removes :SYNC_ID: in Emacs, the entry
    should re-adopt the cloud's UUID on the next pull
    instead of creating a duplicate."""

    def test_adopt_uuid_on_content_match(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        # Create a local entry that gets synced.
        entry = backend.quick_book(
            duration_str="1h",
            customer="Acme", description="work",
        )
        sync_svc.run_sync_cycle(
            cloud_url="http://fake", api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        original_sid = entry["sync_id"]
        assert original_sid in fake_cloud.entries

        # Simulate user removing SYNC_ID in Emacs:
        # re-read the file, strip the property, write.
        from kaisho.org.parser import parse_org_file
        from kaisho.org.writer import write_org_file
        org = parse_org_file(
            backend.data_file, set(),
        )
        for h in org.headings:
            h.properties.pop("SYNC_ID", None)
            h.dirty = True
        write_org_file(backend.data_file, org)

        # Next read backfills a NEW SYNC_ID.
        entries = backend.list_entries(period="all")
        assert entries[0]["sync_id"] != original_sid

        # Sync again — cloud still has original_sid.
        sync_svc.run_sync_cycle(
            cloud_url="http://fake", api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )

        # The entry should have re-adopted the cloud's
        # UUID, NOT created a duplicate.
        final = backend.list_entries(period="all")
        assert len(final) == 1
        assert final[0]["sync_id"] == original_sid

    def test_skip_adoption_if_uuid_taken(
        self, backend,
    ):
        # Create two entries: e1 keeps its SYNC_ID,
        # e2 loses it. Then try to adopt e1's UUID
        # for e2 — should be rejected because e1
        # already owns that UUID.
        e1 = backend.quick_book(
            duration_str="1h",
            customer="Acme", description="first",
        )
        e2 = backend.quick_book(
            duration_str="1h",
            customer="Beta", description="second",
        )

        # Try to adopt e1's UUID for e2's content.
        # This must fail — e1 already has that UUID.
        result = clocks_svc.adopt_sync_id(
            backend.data_file,
            sync_id=e1["sync_id"],
            start_iso=e2["start"],
            customer="Beta",
            description="second",
        )
        assert result is None


class TestLastWriterWins:
    def test_newer_local_overwrites_cloud(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        # Shared sync_id with an older cloud copy.
        fake_cloud.entries["sid1"] = {
            "id": "sid1",
            "customer": "A",
            "description": "old",
            "start": "2026-04-15T10:00:00",
            "end": "2026-04-15T11:00:00",
            "task_id": None, "contract": None,
            "notes": "", "invoiced": False,
            "updated_at": "2026-04-15T11:00:00",
            "deleted_at": None,
        }
        # Create a local entry with the same sync_id by
        # inserting directly at the service layer.
        clocks_svc.insert_clock_entry_from_sync(
            backend.data_file,
            {
                "sync_id": "sid1",
                "customer": "A",
                "description": "new",
                "start": "2026-04-15T10:00:00",
                "end": "2026-04-15T11:00:00",
                "task_id": None, "contract": None,
                "notes": "", "invoiced": False,
                # Much later timestamp.
                "updated_at": "2026-04-16T09:00:00",
            },
        )
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        assert (
            fake_cloud.entries["sid1"]["description"]
            == "new"
        )


# ── Tests: tombstones ─────────────────────────────────


class TestTombstones:
    def test_local_delete_produces_tombstone(
        self, backend, profile_dir, monkeypatch,
    ):
        from kaisho import config as kaisho_config

        class FakeCfg:
            PROFILE_DIR = profile_dir

        monkeypatch.setattr(
            kaisho_config, "get_config",
            lambda: FakeCfg(),
        )
        entry = backend.quick_book(
            duration_str="30m",
            customer="Acme", description="",
        )
        deleted = backend.delete_entry(entry["start"])
        assert deleted is not None
        sync_svc.on_local_delete(deleted)
        tombstones = sync_state.load_tombstones(
            profile_dir,
        )
        assert len(tombstones) == 1
        assert tombstones[0]["sync_id"] == deleted["sync_id"]

    def test_tombstone_pushes_and_clears(
        self, backend, fake_cloud,
        profile_dir, patched_backend, monkeypatch,
    ):
        from kaisho import config as kaisho_config

        class FakeCfg:
            PROFILE_DIR = profile_dir

        monkeypatch.setattr(
            kaisho_config, "get_config",
            lambda: FakeCfg(),
        )
        entry = backend.quick_book(
            duration_str="30m",
            customer="Acme", description="",
        )
        deleted = backend.delete_entry(entry["start"])
        sync_svc.on_local_delete(deleted)
        assert len(
            sync_state.load_tombstones(profile_dir),
        ) == 1
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        # Tombstone should be pushed and cleared locally.
        assert (
            sync_state.load_tombstones(profile_dir) == []
        )
        assert (
            fake_cloud.entries[entry["sync_id"]]
            ["deleted_at"]
            is not None
        )


# ── Tests: cursor state ───────────────────────────────


class TestCursorState:
    def test_cursor_advances_after_pull(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        fake_cloud.entries["abc"] = {
            "id": "abc",
            "customer": "Beta",
            "description": "",
            "start": "2026-04-15T10:00:00",
            "end": "2026-04-15T11:00:00",
            "task_id": None, "contract": None,
            "notes": "", "invoiced": False,
            "updated_at": "2026-04-15T11:00:00",
            "deleted_at": None,
        }
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        cursor = sync_state.load_cursor(profile_dir)
        assert cursor["last_pull_cursor"] == (
            "2026-04-15T11:00:00"
        )

    def test_pull_bumps_push_cursor(
        self, backend, fake_cloud,
        profile_dir, patched_backend,
    ):
        fake_cloud.entries["abc"] = {
            "id": "abc",
            "customer": "Beta",
            "description": "",
            "start": "2026-04-15T10:00:00",
            "end": "2026-04-15T11:00:00",
            "task_id": None, "contract": None,
            "notes": "", "invoiced": False,
            "updated_at": "2026-04-15T11:00:00",
            "deleted_at": None,
        }
        sync_svc.run_sync_cycle(
            cloud_url="http://fake",
            api_key="key",
            profile_dir=profile_dir,
            clocks_file=backend.data_file,
        )
        cursor = sync_state.load_cursor(profile_dir)
        assert (
            cursor["last_push_cursor"]
            >= "2026-04-15T11:00:00"
        )


# ── Tests: sync_state storage ─────────────────────────


class TestSyncState:
    def test_empty_state_defaults(self, profile_dir):
        c = sync_state.load_cursor(profile_dir)
        assert c["last_pull_cursor"] == sync_state.EPOCH
        assert c["last_push_cursor"] == sync_state.EPOCH
        assert sync_state.load_tombstones(
            profile_dir,
        ) == []

    def test_record_and_clear_tombstone(self, profile_dir):
        sync_state.record_tombstone(
            profile_dir,
            {
                "sync_id": "s1",
                "start": "2026-04-15T10:00:00",
                "deleted_at": "2026-04-15T11:00:00",
                "updated_at": "2026-04-15T11:00:00",
            },
        )
        assert len(
            sync_state.load_tombstones(profile_dir),
        ) == 1
        sync_state.clear_tombstones(profile_dir, ["s1"])
        assert sync_state.load_tombstones(
            profile_dir,
        ) == []

    def test_duplicate_tombstones_collapse(
        self, profile_dir,
    ):
        t1 = {
            "sync_id": "s1",
            "start": "2026-04-15T10:00:00",
            "deleted_at": "2026-04-15T11:00:00",
            "updated_at": "2026-04-15T11:00:00",
        }
        t2 = {**t1, "updated_at": "2026-04-15T12:00:00"}
        sync_state.record_tombstone(profile_dir, t1)
        sync_state.record_tombstone(profile_dir, t2)
        ts = sync_state.load_tombstones(profile_dir)
        assert len(ts) == 1
        assert ts[0]["updated_at"] == (
            "2026-04-15T12:00:00"
        )


# ── Tests: wire helpers ───────────────────────────────


class TestWireHelpers:
    def test_entry_to_wire_keys(self):
        out = sync_svc.entry_to_wire({
            "sync_id": "x",
            "customer": "A",
            "description": "d",
            "start": "2026-01-01T00:00:00",
            "end": "2026-01-01T01:00:00",
            "task_id": None,
            "contract": None,
            "notes": "",
            "invoiced": False,
            "updated_at": "2026-01-01T01:00:00",
        })
        assert out["id"] == "x"
        assert "sync_id" not in out

    def test_wire_to_local_keys(self):
        out = sync_svc.wire_to_local({
            "id": "x",
            "customer": "A",
            "description": "",
            "start": "2026-01-01T00:00:00",
            "end": None,
            "updated_at": "2026-01-01T00:00:00",
        })
        assert out["sync_id"] == "x"
        assert "id" not in out
