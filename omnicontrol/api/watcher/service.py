from pathlib import Path

from watchfiles import awatch

from ..ws.manager import manager

# Set of paths currently being written by OmniControl itself
_expected_writes: set[str] = set()

# Map data-file stem → WebSocket resource name
_STEM_TO_RESOURCE: dict[str, str] = {
    "todos": "kanban",
    "clocks": "clocks",
    "kunden": "customers",
    "inbox": "inbox",
}


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
    return None
