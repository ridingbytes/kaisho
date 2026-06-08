"""MCP integration settings router.

Surfaces the local HTTP MCP endpoint and its bearer token to
the Settings -> Integrations panel so the user can copy them
into an MCP client config without dropping to a shell.

Rotation deletes the token file and reads a fresh one on the
next call. Existing clients holding the old value will get a
401 on their next request and need to be reconfigured. The
endpoint deliberately returns the full token plaintext: this
sidecar serves only the local Tauri webview, which has the
same trust scope as the on-disk file itself.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from fastapi import HTTPException

from ...config import get_config
from ...mcp.server import HTTP_MOUNT_PATH, get_active_http_allow
from ...mcp.token import (
    is_disabled,
    load_allow,
    load_or_create_token,
    set_allow,
    set_disabled,
    token_path,
)


router = APIRouter(
    prefix="/api/settings/mcp", tags=["settings"],
)


class McpInfo(BaseModel):
    url: str
    token: str
    mounted_at: str
    enabled: bool
    allow: str
    allow_active: str


class McpToggle(BaseModel):
    enabled: bool


class McpAllow(BaseModel):
    allow: str


def _active_allow() -> str:
    """Return the tier the live FastMCP instance is serving.

    Falls back to the on-disk value when the HTTP transport
    was never built — keeps the panel coherent in stdio-only
    test setups.
    """
    active = get_active_http_allow()
    if active:
        return active
    return load_allow(get_config().DATA_DIR)


def _build_info() -> McpInfo:
    cfg = get_config()
    token = load_or_create_token(cfg.DATA_DIR)
    host = cfg.HOST or "localhost"
    # Public URL is always loopback-facing even when the
    # bind address is 0.0.0.0 for LAN access, because the
    # bearer token only protects against opportunistic
    # access, not against an attacker who can reach the
    # port. UI users almost always want the localhost form.
    display_host = "localhost" if host in (
        "0.0.0.0", "127.0.0.1", "localhost",
    ) else host
    url = (
        f"http://{display_host}:{cfg.PORT}"
        f"{HTTP_MOUNT_PATH}/"
    )
    return McpInfo(
        url=url,
        token=token,
        mounted_at=HTTP_MOUNT_PATH,
        enabled=not is_disabled(cfg.DATA_DIR),
        allow=load_allow(cfg.DATA_DIR),
        allow_active=_active_allow(),
    )


@router.get("", response_model=McpInfo)
def get_mcp_info() -> McpInfo:
    """Return the URL + bearer token for client setup."""
    return _build_info()


@router.post("/rotate", response_model=McpInfo)
def rotate_mcp_token() -> McpInfo:
    """Generate a fresh token, invalidating existing
    clients. The next request from any client still holding
    the old token will return 401.
    """
    cfg = get_config()
    path = token_path(cfg.DATA_DIR)
    if path.exists():
        path.unlink()
    return _build_info()


@router.post("/allow", response_model=McpInfo)
def update_mcp_allow(body: McpAllow) -> McpInfo:
    """Persist the tier the HTTP transport should serve.

    Takes effect on the next ``kai serve`` restart because
    FastMCP registers the tool list eagerly at startup.
    """
    cfg = get_config()
    try:
        set_allow(cfg.DATA_DIR, body.allow)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    return _build_info()


@router.post("/toggle", response_model=McpInfo)
def toggle_mcp(body: McpToggle) -> McpInfo:
    """Enable or disable the HTTP MCP endpoint. When
    disabled the middleware returns 503 to every request
    regardless of the bearer, so existing clients see a
    clean ``service unavailable`` rather than a hang.
    """
    cfg = get_config()
    set_disabled(cfg.DATA_DIR, not body.enabled)
    return _build_info()
