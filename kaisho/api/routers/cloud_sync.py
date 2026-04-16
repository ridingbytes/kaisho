"""Cloud Sync API router.

Exposes endpoints for connecting to the Kaisho Cloud
service, triggering sync, and triaging unassigned
clock entries. All endpoints are no-ops when cloud
sync is disabled.
"""
import urllib.error

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import settings as settings_svc
from ...services import cloud_sync as sync_svc

router = APIRouter(
    prefix="/api/cloud-sync", tags=["cloud-sync"],
)


class ConnectBody(BaseModel):
    url: str
    api_key: str


class TriageEntry(BaseModel):
    start: str
    customer: str | None = None
    task_id: str | None = None
    contract: str | None = None


class TriageBody(BaseModel):
    entries: list[TriageEntry]


def _sync_settings():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return data, cfg


# ── GET /api/cloud-sync/status ────────────────────────

@router.get("/status")
def status():
    """Return cloud sync connection status."""
    data, cfg = _sync_settings()
    sync = settings_svc.get_cloud_sync_settings(data)
    result = {
        "enabled": sync["enabled"],
        "api_key_set": sync["api_key_set"],
        "url": sync.get("url", ""),
        "interval": sync.get("interval", 300),
        "connected": False,
        "plan": None,
        "pending": 0,
    }
    if not sync["enabled"] or not sync["api_key_set"]:
        return result

    url = data.get("cloud_sync", {}).get("url", "")
    key = settings_svc.get_cloud_sync_key(data)
    try:
        cloud = sync_svc.cloud_status(url, key)
        if cloud:
            result["connected"] = True
            result["plan"] = cloud.get("plan")
            result["pending"] = cloud.get("pending", 0)
    except (urllib.error.URLError, OSError):
        # Cloud unreachable; return defaults
        pass
    return result


# ── POST /api/cloud-sync/connect ──────────────────────

@router.post("/connect")
def connect(body: ConnectBody):
    """Connect to the Kaisho Cloud service."""
    url = body.url.rstrip("/")
    try:
        cloud = sync_svc.cloud_status(url, body.api_key)
    except (urllib.error.URLError, OSError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach cloud: {exc}",
        )
    if cloud is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key or cloud URL",
        )

    cfg = get_config()
    settings_svc.set_cloud_sync_settings(
        cfg.SETTINGS_FILE,
        {
            "enabled": True,
            "url": url,
            "api_key": body.api_key,
        },
    )
    return {
        "ok": True,
        "plan": cloud.get("plan"),
    }


# ── POST /api/cloud-sync/disconnect ──────────────────

@router.post("/disconnect")
def disconnect():
    """Disconnect from the Kaisho Cloud service."""
    cfg = get_config()
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

    url = sync.get("url", "")
    key = sync.get("api_key", "")
    if not url or not key:
        return {"active": False}

    result = sync_svc.cloud_active(url, key)
    return result or {"active": False}


# ── POST /api/cloud-sync/sync-now ────────────────────

@router.post("/sync-now")
def sync_now():
    """Trigger an immediate cloud sync cycle."""
    data, cfg = _sync_settings()
    sync = data.get("cloud_sync", {})
    if not sync.get("enabled"):
        return {"pulled": 0, "pushed": False}

    url = sync.get("url", "")
    key = sync.get("api_key", "")
    if not url or not key:
        return {"pulled": 0, "pushed": False}

    from ...backends import get_backend
    backend = get_backend()

    result = sync_svc.run_sync_cycle(
        cloud_url=url,
        api_key=key,
        profile_dir=cfg.PROFILE_DIR,
        clocks_file=backend.clocks.data_file,
        customers_fn=backend.customers.list_customers,
        tasks_fn=lambda: backend.tasks.list_tasks(
            include_done=False,
        ),
    )
    return result


# ── GET /api/cloud-sync/pending ──────────────────────

@router.get("/pending")
def pending():
    """Return clock entries with empty customer."""
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
    return {"updated": updated}
