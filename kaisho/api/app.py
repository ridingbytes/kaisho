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
from .routers import settings as settings_router
from .watcher.service import watch_files


def _restore_active_user() -> None:
    """Restore the last active user on server start.

    Reads .active_user from the data directory. If the
    user dir exists, sets KAISHO_USER and PROFILE env
    vars so the server resumes where the user left off.
    """
    import os
    from pathlib import Path

    cfg = get_config()
    marker = cfg.DATA_DIR / ".active_user"
    if not marker.exists():
        return
    username = marker.read_text(encoding="utf-8").strip()
    if not username:
        return
    user_dir = cfg.DATA_DIR / "users" / username
    if not user_dir.is_dir():
        return
    os.environ["KAISHO_USER"] = username
    profile = resolve_active_profile(user_dir)
    os.environ["PROFILE"] = profile
    reset_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    # Restore the last logged-in user and profile so the
    # server doesn't default to "default" after restart.
    if not os.environ.get("KAISHO_USER"):
        _restore_active_user()
    elif not os.environ.get("PROFILE"):
        cfg0 = get_config()
        saved = resolve_active_profile(cfg0.USER_DIR)
        if saved != cfg0.PROFILE:
            os.environ["PROFILE"] = saved
            reset_config()
    # Only run init_data_dir when the profile dir
    # already exists.
    cfg = get_config()
    if cfg.PROFILE_DIR.is_dir():
        init_data_dir(cfg)
    watch_paths = get_backend().watch_paths
    task = asyncio.create_task(watch_files(*watch_paths))
    yield
    task.cancel()


app = FastAPI(title="Kaisho", lifespan=lifespan)

_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]


def _cors_origins() -> list[str]:
    """Read CORS origins from env or fall back to defaults."""
    import os
    env = os.environ.get("CORS_ORIGINS", "")
    if env:
        return [o.strip() for o in env.split(",") if o.strip()]
    return _DEFAULT_ORIGINS


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
app.include_router(settings_router.router)
app.include_router(settings_router.auth_router)
app.include_router(github.router)
app.include_router(advisor.router)
app.include_router(dashboard.router)
app.include_router(ws_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}
