import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..config import get_config
from .routers import (
    clocks,
    customers,
    dashboard,
    inbox,
    kanban,
    ws as ws_router,
)
from .routers import settings as settings_router
from .watcher.service import watch_files


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_config()
    org_dir = cfg.ORG_DIR.expanduser()
    settings_file = cfg.SETTINGS_FILE
    task = asyncio.create_task(
        watch_files(org_dir, settings_file)
    )
    yield
    task.cancel()


app = FastAPI(title="OmniControl", lifespan=lifespan)

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
app.include_router(settings_router.router)
app.include_router(dashboard.router)
app.include_router(ws_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}
