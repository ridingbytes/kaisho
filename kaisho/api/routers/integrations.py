"""Integrations API router.

Proxies the desktop UI to a connected Kaisho server's
``/integrations`` endpoints using the stored cloud-sync
credentials. Integrations (Linear / Slack / Google Calendar /
GitHub Projects) are available to any connected account.

GitHub's token is stored **locally** (it powers the local
GitHub sidebar view and the local AI tools, which run on the
desktop). When a server is connected, the same token is also
pushed to it so the hosted MCP gateway and the server-side
advisor can reach GitHub. This is the single place a GitHub
PAT is entered.
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

# GitHub connects locally; when a server is connected its
# token is also copied there. Other kinds are server-only.
GITHUB_KIND = "github"


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


# ── GitHub (stored locally) ───────────────────────────


def _github_token_set() -> bool:
    """Whether a local GitHub PAT is configured."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    gh = settings_svc.get_github_settings(data)
    return bool(gh.get("token"))


def _connect_github(token: str) -> dict:
    """Store the GitHub PAT locally, and additionally on a
    connected server (so its gateway can use it). Local
    storage always wins."""
    cfg = get_config()
    settings_svc.set_github_settings(
        cfg.SETTINGS_FILE, {"token": token},
    )
    url, key = _cloud_creds()
    if url and key:
        _cloud(
            url, key, f"/integrations/{GITHUB_KIND}", "POST",
            {"api_key": token},
        )
    return {"connected": GITHUB_KIND}


def _disconnect_github() -> dict:
    """Clear the local GitHub PAT, and the copy on a connected
    server too when present."""
    cfg = get_config()
    settings_svc.set_github_settings(
        cfg.SETTINGS_FILE, {"token": ""},
    )
    url, key = _cloud_creds()
    if url and key:
        _cloud(
            url, key, f"/integrations/{GITHUB_KIND}",
            "DELETE",
        )
    return {"disconnected": GITHUB_KIND}


# ── GET /api/integrations ─────────────────────────────


@router.get("")
def list_integrations():
    """List connected integrations: the cloud-stored ones
    (when cloud sync is up) plus a synthetic GitHub entry
    when a local PAT is set."""
    url, key = _cloud_creds()
    result: list[dict] = []
    if url and key:
        try:
            result = _cloud(url, key, "/integrations") or []
        except HTTPException:
            result = []
    if _github_token_set() and not any(
        r.get("kind") == GITHUB_KIND for r in result
    ):
        result.append({"kind": GITHUB_KIND})
    return result


# ── POST /api/integrations/{kind} ─────────────────────


@router.post("/{kind}")
def connect_key(kind: str, body: ConnectKeyBody):
    """Connect an API-key / PAT integration. GitHub stores
    locally; others (e.g. Linear) go to the connected
    server."""
    if kind == GITHUB_KIND:
        return _connect_github(body.api_key)
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
    if kind == GITHUB_KIND:
        return _disconnect_github()
    url, key = _require_cloud()
    return _cloud(url, key, f"/integrations/{kind}", "DELETE")
