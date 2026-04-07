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
    # Restore persisted profile selection so the server doesn't
    # default back to "default" after a restart.
    if not os.environ.get("PROFILE"):
        cfg0 = get_config()
        saved = resolve_active_profile(cfg0.USER_DIR)
        if saved != cfg0.PROFILE:
            os.environ["PROFILE"] = saved
            reset_config()
    # Only run init_data_dir when the profile dir already exists.
    # Avoid auto-creating a "default" profile dir as a startup
    # side-effect — that dir is only created on register/switch.
    cfg = get_config()
    if cfg.PROFILE_DIR.is_dir():
        init_data_dir(cfg)
    watch_paths = get_backend().watch_paths
    task = asyncio.create_task(watch_files(*watch_paths))
    yield
    task.cancel()


app = FastAPI(title="Kaisho", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
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
