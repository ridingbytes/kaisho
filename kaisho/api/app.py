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


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    # Always restore the persisted profile, even if
    # PROFILE env var is set to "default" by pydantic.
    cfg = get_config()
    saved = resolve_active_profile(cfg.DATA_DIR)
    if saved != cfg.PROFILE:
        os.environ["PROFILE"] = saved
        cfg = reset_config()
    if cfg.PROFILE_DIR.is_dir():
        init_data_dir(cfg)
    watch_paths = get_backend().watch_paths
    task = asyncio.create_task(
        watch_files(*watch_paths)
    )
    yield
    task.cancel()


app = FastAPI(title="Kaisho", lifespan=lifespan)

_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
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
app.include_router(github.router)
app.include_router(advisor.router)
app.include_router(dashboard.router)
app.include_router(ws_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}
