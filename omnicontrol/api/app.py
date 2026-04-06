import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..backends import get_backend
from ..config import init_data_dir
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
    init_data_dir()
    watch_paths = get_backend().watch_paths
    task = asyncio.create_task(watch_files(*watch_paths))
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
