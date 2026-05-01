"""File path lookup for the external-editor feature.

Each panel in the UI knows its kind (``tasks``, ``clocks``,
``notes``, ``inbox``) and asks the backend for the absolute
path of the file backing it. The org backend stores everything
in flat ``.org`` files so this is a direct mapping. Markdown
and SQL backends do not yet expose a single file per kind, so
we return 404 — the UI hides the icon when the lookup fails.

We resolve paths through the same profile-aware overlay used
by ``get_backend()`` so the configured ``org_dir`` (Settings
→ Paths) is honoured. ``cfg.TODOS_FILE`` alone returns the
fallback default and would mislead users who pointed Kaisho
at a different org dir.
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ...backends import _OverlayCfg
from ...config import get_config
from ...services import settings as settings_svc

router = APIRouter(prefix="/api/files", tags=["files"])

_KIND_TO_FILENAME = {
    "tasks": "todos.org",
    "clocks": "clocks.org",
    "notes": "notes.org",
    "inbox": "inbox.org",
    "customers": "customers.org",
}


def _active_backend_cfg():
    """Return the overlay cfg the active backend uses, so
    ``ORG_DIR`` reflects the profile's configured path."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    paths = settings_svc.get_path_settings(data, cfg)
    return _OverlayCfg(cfg, paths)


@router.get("/path")
def api_get_file_path(kind: str):
    """Return the absolute path to the file backing the
    given panel kind, for the active backend.

    Returns 404 when the active backend does not store the
    given kind in a single addressable file (markdown,
    json, sql).
    """
    overlay = _active_backend_cfg()
    if overlay.BACKEND != "org":
        raise HTTPException(
            status_code=404,
            detail=(
                f"backend '{overlay.BACKEND}' does not"
                " expose a single file per kind"
            ),
        )

    filename = _KIND_TO_FILENAME.get(kind)
    if filename is None:
        raise HTTPException(
            status_code=400,
            detail=f"unknown kind: {kind}",
        )

    org_dir = Path(overlay.ORG_DIR).expanduser()
    path = org_dir / filename
    return {
        "path": str(path),
        "exists": path.exists(),
    }
