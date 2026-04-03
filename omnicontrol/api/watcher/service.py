from pathlib import Path

from watchfiles import awatch

from ..ws.manager import manager

# Set of paths currently being written by OmniControl itself
_expected_writes: set[str] = set()


def register_self_write(path: Path):
    """Call before writing a file to suppress the watcher event."""
    _expected_writes.add(str(path))


async def watch_files(org_dir: Path, settings_file: Path):
    """Background task: watch org files and settings.yaml."""
    paths = [str(org_dir)]
    async for changes in awatch(*paths, debounce=500):
        for change_type, path_str in changes:
            path = Path(path_str)
            if path_str in _expected_writes:
                _expected_writes.discard(path_str)
                continue
            event = _build_event(path, settings_file)
            if event:
                await manager.broadcast(event)


def _build_event(
    path: Path, settings_file: Path
) -> dict | None:
    """Map a changed file path to a WebSocket event dict."""
    name = path.name
    if name == "todos.org":
        return {
            "type": "file_changed",
            "resource": "kanban",
            "file": name,
        }
    if name == "clocks.org":
        return {
            "type": "file_changed",
            "resource": "clocks",
            "file": name,
        }
    if name == "kunden.org":
        return {
            "type": "file_changed",
            "resource": "customers",
            "file": name,
        }
    if name == "inbox.org":
        return {
            "type": "file_changed",
            "resource": "inbox",
            "file": name,
        }
    if path == settings_file:
        return {
            "type": "settings_changed",
            "resource": "settings",
            "file": name,
        }
    return None
