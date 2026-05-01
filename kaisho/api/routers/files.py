"""File path lookup for the external-editor feature.

Each panel in the UI knows its kind (``tasks``, ``clocks``,
``notes``, ``inbox``) and asks the backend for the absolute
path of the file backing it. The org backend stores everything
in flat ``.org`` files so this is a direct mapping. Markdown
and SQL backends do not yet expose a single file per kind, so
we return 404 — the UI hides the icon when the lookup fails.
"""
from fastapi import APIRouter, HTTPException

from ...config import get_config

router = APIRouter(prefix="/api/files", tags=["files"])

_ORG_KIND_MAP = {
    "tasks": "TODOS_FILE",
    "clocks": "CLOCKS_FILE",
    "notes": "NOTES_FILE",
    "inbox": "INBOX_FILE",
    "customers": "CUSTOMERS_FILE",
}


@router.get("/path")
def api_get_file_path(kind: str):
    """Return the absolute path to the file backing the
    given panel kind, for the active backend.

    Returns 404 when the active backend does not store the
    given kind in a single addressable file (markdown,
    json, sql).
    """
    cfg = get_config()
    if cfg.BACKEND != "org":
        raise HTTPException(
            status_code=404,
            detail=(
                f"backend '{cfg.BACKEND}' does not expose"
                " a single file per kind"
            ),
        )

    attr = _ORG_KIND_MAP.get(kind)
    if attr is None:
        raise HTTPException(
            status_code=400,
            detail=f"unknown kind: {kind}",
        )

    path = getattr(cfg, attr)
    return {
        "path": str(path),
        "exists": path.exists(),
    }
