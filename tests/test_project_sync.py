"""Tests for project cloud-sync: wire format, apply_project
upsert + milestone reconciliation, tombstones, and the
collect-changes cursor filter."""
from kaisho.services import projects as projects_svc
from kaisho.services import sync_state
from kaisho.services import cloud_sync as sync_svc
from kaisho.services.cloud_sync import (
    project_to_wire,
    wire_to_project,
    project_tombstone_to_wire,
    collect_project_changes,
)


# -- Wire format -------------------------------------------

class TestProjectWireFormat:

    def test_project_to_wire(self, org_dir):
        f = org_dir / "projects.org"
        proj = projects_svc.add_project(
            f, "Website", customer="ACME",
            description="Rebuild.", due="2026-06-30",
        )
        projects_svc.add_milestone(
            f, proj["id"], "Design", due="2026-02-01",
        )
        proj = projects_svc.get_project(f, proj["id"])
        wire = project_to_wire(proj)
        assert wire["id"] == proj["id"]
        assert wire["name"] == "Website"
        assert wire["customer"] == "ACME"
        assert wire["status"] == "ACTIVE"
        assert wire["description"] == "Rebuild."
        assert wire["created_at"]
        assert wire["updated_at"]
        assert len(wire["milestones"]) == 1
        m = wire["milestones"][0]
        assert m["title"] == "Design"
        assert m["done"] is False
        assert m["due"] == "2026-02-01"

    def test_wire_to_project(self):
        wire = {
            "id": "P-abc12345",
            "name": "Deploy",
            "customer": "Beta",
            "status": "ON_HOLD",
            "color": "#3b82f6",
            "tags": ["ops"],
            "description": "Ship it.",
            "milestones": [
                {
                    "id": "M-1a2b3c4d",
                    "title": "Cutover",
                    "done": True,
                    "due": None,
                },
            ],
            "updated_at": "2026-04-08T12:00:00Z",
        }
        local = wire_to_project(wire)
        assert local["id"] == wire["id"]
        assert local["status"] == "ON_HOLD"
        assert local["tags"] == ["ops"]
        assert local["milestones"][0]["done"] is True

    def test_round_trip(self, org_dir):
        f = org_dir / "projects.org"
        proj = projects_svc.add_project(
            f, "RoundTrip", customer="Corp",
        )
        projects_svc.add_milestone(f, proj["id"], "MS one")
        proj = projects_svc.get_project(f, proj["id"])
        back = wire_to_project(project_to_wire(proj))
        assert back["id"] == proj["id"]
        assert back["name"] == proj["name"]
        assert len(back["milestones"]) == 1
        assert (
            back["milestones"][0]["id"]
            == proj["milestones"][0]["id"]
        )


# -- apply_project upsert + milestone reconciliation -------

class TestApplyProject:

    def test_apply_creates_with_exact_id(self, org_dir):
        f = org_dir / "projects.org"
        entry = {
            "id": "P-fixed001",
            "name": "Imported",
            "customer": "ACME",
            "status": "ACTIVE",
            "color": "#10b981",
            "tags": ["a"],
            "description": "Body text.",
            "updated_at": "2026-05-01T09:00:00",
            "milestones": [],
        }
        applied = projects_svc.apply_project(f, entry)
        assert applied["id"] == "P-fixed001"
        got = projects_svc.get_project(f, "P-fixed001")
        assert got is not None
        assert got["name"] == "Imported"
        assert got["customer"] == "ACME"
        assert got["color"] == "#10b981"
        assert got["description"] == "Body text."
        assert got["updated_at"] == "2026-05-01T09:00:00"

    def test_apply_guards_bad_status(self, org_dir):
        f = org_dir / "projects.org"
        entry = {
            "id": "P-fixed002",
            "name": "X",
            "status": "NONSENSE",
            "milestones": [],
        }
        applied = projects_svc.apply_project(f, entry)
        assert applied["status"] == "ACTIVE"

    def test_apply_updates_scalar_fields(self, org_dir):
        f = org_dir / "projects.org"
        proj = projects_svc.add_project(
            f, "Old", customer="ACME", status="ACTIVE",
        )
        entry = {
            "id": proj["id"],
            "name": "New",
            "customer": "",
            "status": "COMPLETED",
            "description": "Updated.",
            "updated_at": "2026-06-01T00:00:00",
            "milestones": [],
        }
        applied = projects_svc.apply_project(f, entry)
        assert applied["name"] == "New"
        assert applied["status"] == "COMPLETED"
        assert applied["customer"] is None
        assert applied["description"] == "Updated."

    def test_milestone_add_update_delete(self, org_dir):
        f = org_dir / "projects.org"
        proj = projects_svc.add_project(f, "P")
        # Seed two milestones with known ids via apply.
        projects_svc.apply_project(f, {
            "id": proj["id"],
            "name": "P",
            "milestones": [
                {"id": "M-keep0001", "title": "Keep",
                 "done": False, "due": "2026-01-01"},
                {"id": "M-drop0002", "title": "Drop",
                 "done": False, "due": None},
            ],
        })
        got = projects_svc.get_project(f, proj["id"])
        assert len(got["milestones"]) == 2

        # Reconcile: update Keep (done+title), drop Drop,
        # add a fresh milestone.
        projects_svc.apply_project(f, {
            "id": proj["id"],
            "name": "P",
            "milestones": [
                {"id": "M-keep0001", "title": "Kept",
                 "done": True, "due": "2026-01-01"},
                {"id": "M-new00003", "title": "New",
                 "done": False, "due": None},
            ],
        })
        got = projects_svc.get_project(f, proj["id"])
        by_id = {m["id"]: m for m in got["milestones"]}
        assert set(by_id) == {"M-keep0001", "M-new00003"}
        assert by_id["M-keep0001"]["title"] == "Kept"
        assert by_id["M-keep0001"]["done"] is True
        assert by_id["M-new00003"]["title"] == "New"


# -- Tombstones --------------------------------------------

class TestProjectTombstone:

    def test_tombstone_to_wire(self, org_dir):
        f = org_dir / "projects.org"
        proj = projects_svc.add_project(f, "Doomed")
        tombstone = {
            **proj,
            "sync_id": proj["id"],
            "deleted_at": "2026-06-01T00:00:00",
            "updated_at": "2026-06-01T00:00:00",
        }
        wire = project_tombstone_to_wire(tombstone)
        assert wire["id"] == proj["id"]
        assert wire["deleted_at"]
        assert wire["updated_at"] == wire["deleted_at"]

    def test_on_local_delete_records_tombstone(
        self, org_dir, tmp_path, monkeypatch,
    ):
        from kaisho import config as kaisho_config

        profile_dir = tmp_path / "profile"

        class FakeCfg:
            PROFILE_DIR = profile_dir

        monkeypatch.setattr(
            kaisho_config, "get_config",
            lambda: FakeCfg(),
        )
        f = org_dir / "projects.org"
        proj = projects_svc.add_project(f, "Doomed")
        sync_svc.on_local_delete_project(proj)
        tombstones = sync_state.load_entity_tombstones(
            profile_dir, "project",
        )
        assert len(tombstones) == 1
        assert tombstones[0]["sync_id"] == proj["id"]
        assert tombstones[0]["deleted_at"]


# -- collect_project_changes cursor filter -----------------

class TestCollectProjectChanges:

    def test_filters_by_cursor(self, org_dir):
        f = org_dir / "projects.org"
        old = projects_svc.apply_project(f, {
            "id": "P-old00001",
            "name": "Old",
            "updated_at": "2026-01-01T00:00:00",
            "milestones": [],
        })
        new = projects_svc.apply_project(f, {
            "id": "P-new00001",
            "name": "New",
            "updated_at": "2026-09-01T00:00:00",
            "milestones": [],
        })
        wire = collect_project_changes(
            f, "2026-06-01T00:00:00",
        )
        ids = {w["id"] for w in wire}
        assert new["id"] in ids
        assert old["id"] not in ids

    def test_excludes_pulled_ids(self, org_dir):
        f = org_dir / "projects.org"
        proj = projects_svc.apply_project(f, {
            "id": "P-exc00001",
            "name": "Excluded",
            "updated_at": "2026-09-01T00:00:00",
            "milestones": [],
        })
        wire = collect_project_changes(
            f, "2026-01-01T00:00:00",
            exclude={proj["id"]},
        )
        assert wire == []


# -- pull_and_apply_projects (LWW + tombstone) -------------

class TestPullAndApplyProjects:

    def _patch_pull(self, monkeypatch, pages):
        """Stub the cloud pull/ack calls with fixed pages."""
        seq = iter(pages)

        def fake_pull(cloud_url, api_key, since):
            return next(seq)

        monkeypatch.setattr(
            sync_svc, "pull_project_changes", fake_pull,
        )
        monkeypatch.setattr(
            sync_svc, "ack_project_items",
            lambda *a, **kw: None,
        )

    def test_creates_and_deletes(
        self, org_dir, monkeypatch,
    ):
        f = org_dir / "projects.org"
        # Seed a local project the cloud will tombstone.
        projects_svc.apply_project(f, {
            "id": "P-gone0001",
            "name": "Gone",
            "updated_at": "2026-01-01T00:00:00",
            "milestones": [],
        })
        self._patch_pull(monkeypatch, [(
            "2026-09-02T00:00:00Z",
            [
                {
                    "id": "P-fresh001",
                    "name": "Fresh",
                    "updated_at": "2026-09-01T00:00:00Z",
                    "milestones": [],
                },
                {
                    "id": "P-gone0001",
                    "name": "Gone",
                    "updated_at": "2026-09-02T00:00:00Z",
                    "deleted_at": "2026-09-02T00:00:00Z",
                    "milestones": [],
                },
            ],
            False,
        )])
        cursor, up, deleted, pulled = (
            sync_svc.pull_and_apply_projects(
                f, "http://fake", "key",
                "2026-01-01T00:00:00Z",
            )
        )
        assert up == 1
        assert deleted == 1
        assert pulled == {"P-fresh001", "P-gone0001"}
        ids = {
            p["id"]
            for p in projects_svc.list_projects(
                f, include_archived=True,
            )
        }
        assert "P-fresh001" in ids
        assert "P-gone0001" not in ids

    def test_lww_skips_older_remote(
        self, org_dir, monkeypatch,
    ):
        f = org_dir / "projects.org"
        projects_svc.apply_project(f, {
            "id": "P-newer01",
            "name": "Local newer",
            "updated_at": "2026-09-10T00:00:00",
            "milestones": [],
        })
        self._patch_pull(monkeypatch, [(
            "2026-09-05T00:00:00Z",
            [{
                "id": "P-newer01",
                "name": "Remote older",
                "updated_at": "2026-09-05T00:00:00Z",
                "milestones": [],
            }],
            False,
        )])
        _, up, deleted, _ = (
            sync_svc.pull_and_apply_projects(
                f, "http://fake", "key",
                "2026-01-01T00:00:00Z",
            )
        )
        assert up == 0
        assert deleted == 0
        got = projects_svc.get_project(f, "P-newer01")
        assert got["name"] == "Local newer"
