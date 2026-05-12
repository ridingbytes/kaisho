import asyncio
from functools import partial
from pathlib import Path

from watchfiles import awatch

from ...backends import get_backend
from ..ws.manager import get_event_loop, manager

# Set of paths currently being written by Kaisho itself
_expected_writes: set[str] = set()

# Module-level handle to the currently running watcher task
# so it can be cancelled/restarted on profile switch.
# Assumes single-worker uvicorn (kaisho's default deployment).
_watcher_task: asyncio.Task | None = None

# Map data-file stem → WebSocket resource name
_STEM_TO_RESOURCE: dict[str, str] = {
    "todos": "kanban",
    "clocks": "clocks",
    "customers": "customers",
    "inbox": "inbox",
    "notes": "notes",
}

_KNOWLEDGE_SUFFIXES = {".md"}


def register_self_write(path: Path):
    """Call before writing a file to suppress the watcher event."""
    _expected_writes.add(str(path))


async def watch_files(*paths: Path):
    """Watch directories and detect file changes.

    Directories in *paths are watched recursively; plain files are
    checked for settings-change detection.
    """
    watch_dirs = [str(p) for p in paths if p.is_dir()]
    settings_files = {p for p in paths if not p.is_dir()}

    async for changes in awatch(*watch_dirs, debounce=500):
        for _change_type, path_str in changes:
            path = Path(path_str)
            if path_str in _expected_writes:
                _expected_writes.discard(path_str)
                continue
            event = _build_event(path, settings_files)
            if event:
                await manager.broadcast(event)


def _build_event(
    path: Path, settings_files: set[Path]
) -> dict | None:
    """Map a changed file path to a WebSocket event dict."""
    if path in settings_files:
        return {
            "type": "settings_changed",
            "resource": "settings",
            "file": path.name,
        }
    resource = _STEM_TO_RESOURCE.get(path.stem)
    if resource:
        return {
            "type": "file_changed",
            "resource": resource,
            "file": path.name,
        }
    if path.suffix in _KNOWLEDGE_SUFFIXES:
        return {
            "type": "file_changed",
            "resource": "knowledge",
            "file": path.name,
        }
    return None


def start_watcher(*paths: Path) -> None:
    """Launch the file watcher task for *paths*.

    Cancels any previously running watcher task before
    starting a new one.
    """
    global _watcher_task
    stop_watcher()
    _watcher_task = asyncio.create_task(watch_files(*paths))


def stop_watcher() -> None:
    """Cancel the currently running watcher task, if any."""
    global _watcher_task
    if _watcher_task is not None and not _watcher_task.done():
        _watcher_task.cancel()
    _watcher_task = None


def restart_watcher() -> None:
    """Restart the watcher with the active backend's paths.

    Safe to call from a request handler; schedules the
    restart on the running event loop. No-op if called
    before the loop is up.
    """
    loop = get_event_loop()
    if loop is None:
        return
    watch_paths = get_backend().watch_paths
    loop.call_soon_threadsafe(partial(start_watcher, *watch_paths))
