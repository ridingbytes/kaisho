"""File path lookup for the external-editor feature.

Each panel in the UI knows its kind (``tasks``, ``clocks``,
``notes``, ``inbox``) and asks the backend for the absolute
path of the file backing it.

Org, markdown, and JSON backends all store one file per kind
inside a single dir, just with different extensions. SQL has
no underlying file, so the lookup returns 404 and the UI
hides the icon.

We resolve paths through the same profile-aware overlay used
by ``get_backend()`` so the configured ``org_dir`` /
``markdown_dir`` / ``json_dir`` (Settings → Paths) are
honoured. ``cfg.TODOS_FILE`` alone returns the fallback
default and would mislead users who pointed Kaisho at a
different dir.
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ...backends import _OverlayCfg
from ...config import get_config
from ...services import settings as settings_svc

router = APIRouter(prefix="/api/files", tags=["files"])

# Per-backend mapping from panel kind to the filename used
# inside the backend's data directory. Org and markdown
# share the ``todos`` name; JSON deviates with ``tasks``.
_KIND_FILENAMES = {
    "org": {
        "tasks": "todos.org",
        "clocks": "clocks.org",
        "notes": "notes.org",
        "inbox": "inbox.org",
        "customers": "customers.org",
    },
    "markdown": {
        "tasks": "todos.md",
        "clocks": "clocks.md",
        "notes": "notes.md",
        "inbox": "inbox.md",
        "customers": "customers.md",
    },
    "json": {
        "tasks": "tasks.json",
        "clocks": "clocks.json",
        "notes": "notes.json",
        "inbox": "inbox.json",
        "customers": "customers.json",
    },
}

_BACKEND_DIR_ATTR = {
    "org": "ORG_DIR",
    "markdown": "MARKDOWN_DIR",
    "json": "JSON_DIR",
}


def _active_backend_cfg():
    """Return the overlay cfg the active backend uses, so
    the configured per-backend dirs are honoured."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    paths = settings_svc.get_path_settings(data, cfg)
    return _OverlayCfg(cfg, paths)


@router.get("/path")
def api_get_file_path(kind: str):
    """Return the absolute path to the file backing the
    given panel kind, for the active backend.

    Returns 404 when the active backend has no addressable
    file for the kind (currently the SQL backend).
    """
    overlay = _active_backend_cfg()
    backend = overlay.BACKEND
    kind_map = _KIND_FILENAMES.get(backend)
    if kind_map is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"backend '{backend}' does not expose"
                " a single file per kind"
            ),
        )

    filename = kind_map.get(kind)
    if filename is None:
        raise HTTPException(
            status_code=400,
            detail=f"unknown kind: {kind}",
        )

    dir_attr = _BACKEND_DIR_ATTR[backend]
    base_dir = Path(getattr(overlay, dir_attr)).expanduser()
    path = base_dir / filename
    return {
        "path": str(path),
        "exists": path.exists(),
    }
