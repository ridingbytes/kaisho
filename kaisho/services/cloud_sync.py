"""Cloud Sync service.

Pulls clock entries from the Kaisho Cloud API and writes
them into the local clocks file. Pushes customer/task
snapshots so the mobile UI has reference data.

All cloud sync features are optional. When disabled, the
app works fully standalone with no cloud dependency.
"""
import json
import logging
import tempfile
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

from ..org.models import Clock

log = logging.getLogger(__name__)


# ── State file ────────────────────────────────────────

def _state_path(profile_dir: Path) -> Path:
    return profile_dir / "cloud_sync_state.json"


def load_state(profile_dir: Path) -> dict:
    """Load sync state (last_pull cursor, acked IDs)."""
    path = _state_path(profile_dir)
    if not path.exists():
        return {
            "last_pull": "1970-01-01T00:00:00Z",
            "acked_ids": [],
            "last_snapshot_push": "",
        }
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(profile_dir: Path, state: dict) -> None:
    """Persist sync state atomically."""
    path = _state_path(profile_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        dir=path.parent, suffix=".tmp",
    )
    try:
        with open(fd, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
            f.write("\n")
        Path(tmp).replace(path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


# ── HTTP helpers ──────────────────────────────────────

def _request(
    url: str,
    api_key: str,
    method: str = "GET",
    data: dict | None = None,
) -> dict | list | None:
    """Make an HTTP request to the cloud API."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = (
        json.dumps(data).encode("utf-8")
        if data is not None
        else None
    )
    req = urllib.request.Request(
        url, data=body, headers=headers, method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


# ── Pull clocks ───────────────────────────────────────

def pull_clocks(
    cloud_url: str,
    api_key: str,
    since: str = "1970-01-01T00:00:00Z",
) -> dict:
    """Fetch unsynced completed clock entries."""
    url = (
        f"{cloud_url}/sync/pull-clocks"
        f"?since={since}&limit=100"
    )
    return _request(url, api_key)


def ack_clocks(
    cloud_url: str,
    api_key: str,
    entry_ids: list[str],
) -> dict:
    """Acknowledge synced entries."""
    url = f"{cloud_url}/sync/ack-clocks"
    return _request(url, api_key, "POST", {
        "entry_ids": entry_ids,
    })


# ── Push snapshot ─────────────────────────────────────

def push_snapshot(
    cloud_url: str,
    api_key: str,
    customers: list[dict],
    tasks: list[dict],
) -> dict:
    """Push customer/task reference data to the cloud."""
    url = f"{cloud_url}/sync/push-snapshot"
    return _request(url, api_key, "POST", {
        "customers": customers,
        "tasks": tasks,
        "snapshot_at": datetime.now().isoformat(),
    })


# ── Cloud status ──────────────────────────────────────

def cloud_status(
    cloud_url: str, api_key: str,
) -> dict | None:
    """Check cloud connection and plan."""
    url = f"{cloud_url}/sync/status"
    return _request(url, api_key)


# ── Sync cycle ────────────────────────────────────────

def run_sync_cycle(
    cloud_url: str,
    api_key: str,
    profile_dir: Path,
    clocks_file: Path,
    customers_fn=None,
    tasks_fn=None,
) -> dict:
    """Run one sync cycle: pull clocks, push snapshot.

    Returns {"pulled": int, "pushed": bool, "error": str}.
    """
    from .clocks import _append_clock_entry

    result = {"pulled": 0, "pushed": False, "error": ""}

    state = load_state(profile_dir)
    acked_set = set(state.get("acked_ids", []))

    # Pull completed entries
    try:
        resp = pull_clocks(
            cloud_url, api_key, state["last_pull"],
        )
    except (urllib.error.URLError, OSError) as exc:
        result["error"] = f"Cloud unreachable: {exc}"
        log.warning("Cloud sync pull failed: %s", exc)
        return result

    entries = resp.get("entries", [])
    new_ids = []

    for entry in entries:
        eid = entry.get("id")
        if eid in acked_set:
            continue

        start = datetime.fromisoformat(entry["start"])
        end_str = entry.get("end")
        end = (
            datetime.fromisoformat(end_str)
            if end_str else None
        )
        if end is None:
            continue

        clock = Clock(start=start, end=end)
        _append_clock_entry(
            clocks_file,
            customer=entry.get("customer") or "",
            description=entry.get("description") or "",
            clock=clock,
            task_id=entry.get("task_id"),
            contract=entry.get("contract"),
        )
        new_ids.append(eid)

    # Acknowledge
    if new_ids:
        try:
            ack_clocks(cloud_url, api_key, new_ids)
        except (urllib.error.URLError, OSError) as exc:
            log.warning("Cloud ack failed: %s", exc)

        acked_set.update(new_ids)
        state["last_pull"] = resp.get(
            "cursor", state["last_pull"],
        )
        result["pulled"] = len(new_ids)

    # Prune old acked IDs (keep last 500)
    acked_list = list(acked_set)
    if len(acked_list) > 500:
        acked_list = acked_list[-500:]
    state["acked_ids"] = acked_list

    # Push snapshot if functions are provided
    if customers_fn and tasks_fn:
        try:
            customers_raw = customers_fn()
            tasks_raw = tasks_fn()
            customers_data = [
                {
                    "name": c.get("name", ""),
                    "contracts": [
                        {
                            "name": ct.get("name", ""),
                            "budget": ct.get("budget", 0),
                            "start_date": ct.get(
                                "start_date", "",
                            ),
                        }
                        for ct in c.get("contracts", [])
                    ],
                }
                for c in customers_raw
            ]
            tasks_data = [
                {
                    "id": t.get("id", ""),
                    "customer": t.get("customer") or "",
                    "title": t.get("title", ""),
                    "status": t.get("status", ""),
                }
                for t in tasks_raw
            ]
            push_snapshot(
                cloud_url, api_key,
                customers_data, tasks_data,
            )
            state["last_snapshot_push"] = (
                datetime.now().isoformat()
            )
            result["pushed"] = True
        except (urllib.error.URLError, OSError) as exc:
            log.warning(
                "Cloud snapshot push failed: %s", exc,
            )

    save_state(profile_dir, state)
    return result
