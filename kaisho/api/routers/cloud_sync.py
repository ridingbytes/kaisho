"""Cloud Sync API router.

Exposes endpoints for connecting to the Kaisho Cloud
service, triggering sync, and reporting sync state. All
endpoints are no-ops when cloud sync is disabled.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import cloud_sync as sync_svc
from ...services import settings as settings_svc
from ...services import sync_state

router = APIRouter(
    prefix="/api/cloud-sync", tags=["cloud-sync"],
)


class ConnectBody(BaseModel):
    url: str
    api_key: str


def _sync_settings():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return data, cfg


def _cloud_creds(data: dict) -> tuple[str, str]:
    """Return (url, api_key) from raw settings dict."""
    sync = data.get("cloud_sync", {})
    return sync.get("url", ""), sync.get("api_key", "")


# ── GET /api/cloud-sync/status ────────────────────────

@router.get("/status")
def status():
    """Return connection + local sync state."""
    data, cfg = _sync_settings()
    sync = settings_svc.get_cloud_sync_settings(data)
    cursor = sync_state.load_cursor(cfg.PROFILE_DIR)
    tombstones = sync_state.load_tombstones(cfg.PROFILE_DIR)
    result = {
        "enabled": sync["enabled"],
        "api_key_set": sync["api_key_set"],
        "url": sync.get("url", ""),
        "interval": sync.get("interval", 300),
        "connected": False,
        "plan": None,
        "last_pull_cursor": cursor["last_pull_cursor"],
        "last_push_cursor": cursor["last_push_cursor"],
        "last_pull_at": cursor["last_pull_at"],
        "last_push_at": cursor["last_push_at"],
        "last_error": cursor["last_error"],
        "pending_deletes": len(tombstones),
    }
    if not sync["enabled"] or not sync["api_key_set"]:
        return result

    url, key = _cloud_creds(data)
    stats = sync_svc.cloud_stats(url, key)
    if stats:
        result["connected"] = True
        result["plan"] = stats.get("plan")
        result["cloud_entry_count"] = stats.get(
            "entry_count", 0,
        )
        result["cloud_last_change_at"] = stats.get(
            "last_change_at",
        )
        result["cloud_active_timer_id"] = stats.get(
            "active_timer_id",
        )
    return result


# ── POST /api/cloud-sync/connect ──────────────────────

@router.post("/connect")
def connect(body: ConnectBody):
    """Connect to the Kaisho Cloud service.

    Resets the sync cursor and tombstones so a fresh
    sync starts clean — no stale state from a previous
    account carries over.
    """
    url = body.url.rstrip("/")
    stats = sync_svc.cloud_stats(url, body.api_key)
    if stats is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key or cloud URL",
        )

    cfg = get_config()
    # Reset sync state so all local entries push to the
    # new account and the pull cursor starts from epoch.
    sync_state.save_cursor(
        cfg.PROFILE_DIR, sync_state.DEFAULT_CURSOR,
    )
    sync_state.save_tombstones(cfg.PROFILE_DIR, [])

    settings_svc.set_cloud_sync_settings(
        cfg.SETTINGS_FILE,
        {
            "enabled": True,
            "url": url,
            "api_key": body.api_key,
        },
    )
    return {"ok": True, "plan": stats.get("plan")}


# ── POST /api/cloud-sync/disconnect ──────────────────

@router.post("/disconnect")
def disconnect():
    """Disconnect from the Kaisho Cloud service.

    Runs a final pull so any mobile-only entries are
    saved to the local org file (the single source of
    truth), then wipes all entries from the cloud. On
    the next connect, a full push rebuilds the cloud
    from local state.

    Order of operations:
      1. Final pull → save mobile entries locally
      2. Wipe cloud entries → clean slate
      3. Clear local sync state (cursor + tombstones)
      4. Disable cloud sync in settings
    """
    data, cfg = _sync_settings()
    url, key = _cloud_creds(data)

    # Step 1: final pull to save mobile-only entries.
    if url and key:
        try:
            from ...backends import get_backend
            backend = get_backend()
            sync_svc.run_sync_cycle(
                cloud_url=url,
                api_key=key,
                profile_dir=cfg.PROFILE_DIR,
                clocks_file=backend.clocks.data_file,
            )
        except Exception:
            pass  # Best-effort; don't block disconnect.

        # Step 2: wipe cloud entries.
        try:
            sync_svc.wipe_cloud_entries(url, key)
        except sync_svc.CloudUnavailable:
            pass  # Offline; entries stay on cloud.

    # Step 3: clear local sync state.
    sync_state.save_cursor(
        cfg.PROFILE_DIR, sync_state.DEFAULT_CURSOR,
    )
    sync_state.save_tombstones(cfg.PROFILE_DIR, [])

    # Step 4: disable cloud sync.
    settings_svc.set_cloud_sync_settings(
        cfg.SETTINGS_FILE,
        {"enabled": False, "api_key": "", "url": ""},
    )
    return {"ok": True}


# ── GET /api/cloud-sync/active ────────────────────────

@router.get("/active")
def active():
    """Return the cloud-side running timer, if any."""
    data, _ = _sync_settings()
    sync = data.get("cloud_sync", {})
    if not sync.get("enabled"):
        return {"active": False}

    url, key = _cloud_creds(data)
    if not url or not key:
        return {"active": False}

    result = sync_svc.cloud_active(url, key)
    return result or {"active": False}


# ── POST /api/cloud-sync/stop-cloud-timer ─────────────

@router.post("/stop-cloud-timer")
def stop_cloud_timer(id: str | None = None):
    """Stop whatever timer is running on the cloud.

    The local CloudTimer card routes its "Stop" button
    through here so the mobile PWA and the local app reach
    consistent state without waiting for the next cron.
    """
    data, _ = _sync_settings()
    sync = data.get("cloud_sync", {})
    if not sync.get("enabled"):
        raise HTTPException(
            status_code=400, detail="Cloud sync disabled",
        )
    url, key = _cloud_creds(data)
    try:
        result = sync_svc.stop_active(
            url, key, {"id": id} if id else {},
        )
    except sync_svc.CloudUnavailable as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Cloud unreachable: {exc}",
        )
    sync_svc.schedule_push()
    return result


# ── POST /api/cloud-sync/sync-now ────────────────────

@router.post("/sync-now")
def sync_now():
    """Trigger an immediate sync cycle (blocking)."""
    data, cfg = _sync_settings()
    sync = data.get("cloud_sync", {})
    if not sync.get("enabled"):
        return {"enabled": False}

    url, key = _cloud_creds(data)
    if not url or not key:
        return {"enabled": False}

    from ...backends import get_backend
    backend = get_backend()
    return sync_svc.run_sync_cycle(
        cloud_url=url,
        api_key=key,
        profile_dir=cfg.PROFILE_DIR,
        clocks_file=backend.clocks.data_file,
        customers_fn=backend.customers.list_customers,
        tasks_fn=lambda: backend.tasks.list_tasks(
            include_done=False,
        ),
    )


# ── GET /api/cloud-sync/pending ──────────────────────

@router.get("/pending")
def pending():
    """Return local clock entries with empty customer."""
    from ...backends import get_backend
    backend = get_backend()
    all_entries = backend.clocks.list_entries(
        period="year",
    )
    return [
        e for e in all_entries
        if not e.get("customer")
    ]


# ── POST /api/cloud-sync/triage ──────────────────────

class TriageEntry(BaseModel):
    start: str
    customer: str | None = None
    task_id: str | None = None
    contract: str | None = None


class TriageBody(BaseModel):
    entries: list[TriageEntry]


@router.post("/triage")
def triage(body: TriageBody):
    """Assign customers and tasks to unassigned entries."""
    from ...backends import get_backend
    backend = get_backend()
    updated = 0
    for entry in body.entries:
        kwargs = {}
        if entry.customer is not None:
            kwargs["customer"] = entry.customer
        if entry.task_id is not None:
            kwargs["task_id"] = entry.task_id
        if entry.contract is not None:
            kwargs["contract"] = entry.contract
        if kwargs:
            result = backend.clocks.update_entry(
                entry.start, **kwargs,
            )
            if result is not None:
                updated += 1
    if updated:
        sync_svc.schedule_push()
    return {"updated": updated}
