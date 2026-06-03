import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..backends import get_backend
from ..config import (
    get_config,
    init_data_dir,
    resolve_active_profile,
    reset_config,
)
from .routers import (
    advisor,
    backup as backup_router,
    clocks,
    cron,
    customers,
    dashboard,
    files as files_router,
    github,
    inbox,
    kanban,
    knowledge,
    notes,
    ws as ws_router,
)
from .routers import cloud_sync
from .routers import integrations as integrations_router
from .routers import settings as settings_router
from .routers import settings_ai
from .routers import settings_mcp
from .routers import settings_profiles
from .routers import settings_states
from .routers import caldav as caldav_router
from .routers import calendar as calendar_router
from .routers import cli as cli_router
from .routers import version as version_router
from ..cron.scheduler import build_scheduler
from ..mcp.server import HTTP_MOUNT_PATH, build_http_app
from .watcher.service import start_watcher, stop_watcher

# Built once at import time so the mounted app + its
# lifespan can be referenced from both ``app.mount`` and
# the FastAPI ``lifespan`` chain below. Rebuilding per
# request would tear the MCP session manager.
_mcp_app = build_http_app()


def _init_ssl():
    """Set default SSL context for urllib.

    PyInstaller bundles on macOS don't inherit the
    system certificate store, so urllib HTTPS requests
    fail with SSL errors. This sets the global default
    context to use certifi's bundled CA certs.
    """
    import ssl
    try:
        import certifi
        ctx = ssl.create_default_context(
            cafile=certifi.where(),
        )
        ssl._create_default_https_context = (
            lambda: ctx
        )
    except ImportError:
        pass


_init_ssl()


async def lifespan(app: FastAPI):
    import os
    # Always restore the persisted profile, even if
    # PROFILE env var is set to "default" by pydantic.
    cfg = get_config()
    saved = resolve_active_profile(cfg.DATA_DIR)
    if saved != cfg.PROFILE:
        os.environ["PROFILE"] = saved
        cfg = reset_config()
    cfg.PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    init_data_dir(cfg)

    # One-shot migration of legacy ``{date}`` /
    # ``{fetch_results}`` placeholders in the profile's
    # prompt files to the new ``${...}`` syntax.
    # Idempotent — running twice does nothing.
    from ..services.placeholders_migration import (
        migrate_profile_prompts,
    )
    migrate_profile_prompts(cfg.PROFILE_DIR)

    # Capture the event loop so background threads
    # (scheduler, cloud WS) can schedule async broadcasts.
    from .ws.manager import set_event_loop
    set_event_loop(asyncio.get_event_loop())

    # Start cron scheduler
    scheduler = build_scheduler(cfg.JOBS_FILE)
    scheduler.start()

    start_watcher(*get_backend().watch_paths)
    # Chain the MCP HTTP app's lifespan so its session
    # manager starts/stops alongside the API. Without this
    # the mounted /mcp endpoint accepts connections but the
    # FastMCP session manager is never initialized and the
    # first request 500s. ``router.lifespan_context`` is the
    # asynccontextmanager-wrapped form; ``app.lifespan`` is
    # the bare async generator factory and can't be used
    # with ``async with`` directly.
    async with _mcp_app.router.lifespan_context(_mcp_app):
        yield
    scheduler.shutdown(wait=False)
    stop_watcher()


app = FastAPI(title="Kaisho", lifespan=lifespan)

# The Tauri webview hosts the production UI from
# tauri://localhost (or http://localhost:8765 in some
# configurations), so 8765 is always allowed. The Vite dev
# server origins are added only when running from source
# (``sys.frozen`` is False), so production builds don't
# ship them.
#
# Previously this list also included
# ``http://localhost:3000``. That entry let any local
# page served from :3000 (a stray dev server, an
# unrelated app) POST credentials to the sidecar API
# from the user's browser. The Tauri webview never uses
# :3000 in any deployment we ship, so the only
# beneficiaries were third parties. Removed per #124.
_PROD_ORIGINS = [
    "http://localhost:8765",
]
_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
]


def _is_dev_build() -> bool:
    """True when running from source (not a frozen sidecar)."""
    import sys
    return not getattr(sys, "frozen", False)


def _cors_origins() -> list[str]:
    """Read CORS origins from env, or fall back to a
    build-aware default.

    ``CORS_ORIGINS`` (comma-separated) wins when set so
    self-hosters can override. Otherwise: prod builds get
    the production origins only; dev builds (running from
    source) additionally allow the Vite dev server.
    """
    import os
    env = os.environ.get("CORS_ORIGINS", "")
    if env:
        return [
            o.strip() for o in env.split(",")
            if o.strip()
        ]
    if _is_dev_build():
        return _PROD_ORIGINS + _DEV_ORIGINS
    return _PROD_ORIGINS


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(kanban.router)
app.include_router(clocks.router)
app.include_router(customers.router)
app.include_router(inbox.router)
app.include_router(notes.router)
app.include_router(knowledge.router)

app.include_router(cron.router)
app.include_router(cloud_sync.router)
app.include_router(integrations_router.router)
app.include_router(backup_router.router)
app.include_router(settings_router.router)
app.include_router(settings_states.router)
app.include_router(settings_ai.router)
app.include_router(settings_mcp.router)
app.include_router(settings_profiles.router)
app.include_router(github.router)
app.include_router(caldav_router.router)
app.include_router(calendar_router.router)
app.include_router(advisor.router)
app.include_router(dashboard.router)
app.include_router(ws_router.router)
app.include_router(version_router.router)
app.include_router(cli_router.router)
app.include_router(files_router.router)

# Mount the streamable-HTTP MCP transport. The mount path
# matches the path inside the MCP app so the public URL the
# user puts into their Claude config is just
# ``http://localhost:8765/mcp`` with a Bearer token from
# Settings → Integrations.
app.mount(HTTP_MOUNT_PATH, _mcp_app)


@app.get("/health")
def health():
    return {"status": "ok"}


# -- Serve frontend static files in production ----------
def _mount_frontend():
    """Mount the built frontend when SERVE_FRONTEND=true.

    In development Vite proxies API calls, so the backend
    should NOT serve static files. In Docker / production,
    set SERVE_FRONTEND=true to serve the built frontend.
    """
    import os
    from pathlib import Path

    serve = os.environ.get(
        "SERVE_FRONTEND", "",
    ).lower()
    if serve not in ("1", "true", "yes"):
        return

    from fastapi.staticfiles import StaticFiles
    from starlette.responses import FileResponse

    import sys
    if getattr(sys, "frozen", False):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).parent.parent.parent
    dist = base / "frontend" / "dist"
    if not dist.is_dir():
        return

    # Serve static assets (JS, CSS, images)
    app.mount(
        "/assets",
        StaticFiles(directory=dist / "assets"),
        name="static-assets",
    )

    # Serve logo/wordmark SVGs from dist root
    for name in (
        "kaisho-logo.svg",
        "kaisho-logo-light.svg",
        "kaisho-wordmark.svg",
        "kaisho-wordmark-light.svg",
    ):
        logo = dist / name
        if logo.exists():
            @app.get(f"/{name}")
            def _logo(p=logo):
                return FileResponse(p)

    # SPA fallback: serve index.html for all non-API paths
    @app.get("/{path:path}")
    async def _spa(path: str):
        if path.startswith("api/"):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                {"detail": "Not Found"},
                status_code=404,
            )
        file = dist / path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(dist / "index.html")


_mount_frontend()
