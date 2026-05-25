"""Premium integrations API router.

Proxies the desktop UI to the Kaisho Cloud ``/integrations``
endpoints using the stored cloud-sync credentials. The
cloud enforces the Pro plan gate; this router just forwards
and surfaces the cloud's error messages.
"""
import json
import urllib.error

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import cloud_sync as sync_svc
from ...services import settings as settings_svc

router = APIRouter(
    prefix="/api/integrations", tags=["integrations"],
)


class ConnectKeyBody(BaseModel):
    api_key: str


def _cloud_creds() -> tuple[str, str]:
    """Return (url, api_key) from cloud-sync settings."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    sync = data.get("cloud_sync", {})
    return sync.get("url", ""), sync.get("api_key", "")


def _require_cloud() -> tuple[str, str]:
    url, key = _cloud_creds()
    if not url or not key:
        raise HTTPException(
            status_code=400,
            detail="Cloud sync is not connected",
        )
    return url, key


def _cloud(url, key, path, method="GET", data=None):
    """Proxy a cloud call, surfacing the cloud's HTTP
    status + error message instead of a generic failure."""
    try:
        return sync_svc.http_request(
            f"{url}{path}", key, method, data,
        )
    except urllib.error.HTTPError as exc:
        detail = "Cloud request failed"
        try:
            body = json.loads(exc.read().decode("utf-8"))
            detail = (
                body.get("error")
                or body.get("detail")
                or detail
            )
        except (ValueError, OSError):
            pass
        raise HTTPException(
            status_code=exc.code, detail=detail,
        )
    except (urllib.error.URLError, OSError):
        raise HTTPException(
            status_code=502, detail="Cloud unreachable",
        )


# ── GET /api/integrations ─────────────────────────────

@router.get("")
def list_integrations():
    """List the user's connected integrations."""
    url, key = _require_cloud()
    return _cloud(url, key, "/integrations") or []


# ── POST /api/integrations/{kind} ─────────────────────

@router.post("/{kind}")
def connect_key(kind: str, body: ConnectKeyBody):
    """Connect an API-key / PAT integration (Linear,
    GitHub)."""
    url, key = _require_cloud()
    return _cloud(
        url, key, f"/integrations/{kind}", "POST",
        {"api_key": body.api_key},
    )


# ── GET /api/integrations/{kind}/connect-url ──────────

@router.get("/{kind}/connect-url")
def connect_url(kind: str):
    """Get the OAuth authorize URL for a provider (Slack,
    Google). The UI opens this in the browser."""
    url, key = _require_cloud()
    return _cloud(url, key, f"/integrations/{kind}/connect")


# ── DELETE /api/integrations/{kind} ───────────────────

@router.delete("/{kind}")
def disconnect(kind: str):
    """Disconnect an integration."""
    url, key = _require_cloud()
    return _cloud(url, key, f"/integrations/{kind}", "DELETE")
