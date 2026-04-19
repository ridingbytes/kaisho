import asyncio
from contextlib import asynccontextmanager

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
    github,
    inbox,
    kanban,
    knowledge,
    notes,
    ws as ws_router,
)
from .routers import cloud_sync
from .routers import settings as settings_router
from .routers import settings_ai
from .routers import settings_profiles
from .routers import settings_states
from .routers import version as version_router
from ..cron.scheduler import build_scheduler
from .watcher.service import watch_files


@asynccontextmanager
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

    # Capture the event loop so background threads
    # (scheduler, cloud WS) can schedule async broadcasts.
    from .ws.manager import set_event_loop
    set_event_loop(asyncio.get_event_loop())

    # Start cron scheduler
    scheduler = build_scheduler(cfg.JOBS_FILE)
    scheduler.start()

    watch_paths = get_backend().watch_paths
    task = asyncio.create_task(
        watch_files(*watch_paths)
    )
    yield
    scheduler.shutdown(wait=False)
    task.cancel()


app = FastAPI(title="Kaisho", lifespan=lifespan)

_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:8765",
]


def _cors_origins() -> list[str]:
    """Read CORS origins from env or defaults."""
    import os
    env = os.environ.get("CORS_ORIGINS", "")
    if env:
        return [
            o.strip() for o in env.split(",")
            if o.strip()
        ]
    return _DEFAULT_ORIGINS


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"http://localhost:\d+",
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
app.include_router(backup_router.router)
app.include_router(settings_router.router)
app.include_router(settings_states.router)
app.include_router(settings_ai.router)
app.include_router(settings_profiles.router)
app.include_router(github.router)
app.include_router(advisor.router)
app.include_router(dashboard.router)
app.include_router(ws_router.router)
app.include_router(version_router.router)


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
