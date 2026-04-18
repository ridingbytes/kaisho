"""Backup action routes (create / list / prune)."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ...config import get_config
from ...services import backup as backup_svc
from ...services import settings as settings_svc

router = APIRouter(
    prefix="/api/backup", tags=["backup"],
)


def _backup_dir():
    """Return the configured backup directory as a Path."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.resolve_backup_dir(data, cfg)


@router.get("/list")
def list_backups():
    """Return existing backups, newest first."""
    target = _backup_dir()
    return [
        b.to_dict() for b in backup_svc.list_backups(target)
    ]


class RunBody(BaseModel):
    """Options for running a backup."""
    prune: bool = True


@router.post("/run")
def run_backup(body: RunBody | None = None):
    """Create a new backup archive now."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    backup_cfg = settings_svc.get_backup_settings(data)
    target = settings_svc.resolve_backup_dir(data, cfg)

    info = backup_svc.create_backup(
        source_dir=cfg.DATA_DIR,
        backup_dir=target,
        profile=cfg.PROFILE,
    )
    removed: list[dict] = []
    should_prune = body.prune if body else True
    if should_prune and backup_cfg.get("keep", 0) > 0:
        removed = [
            b.to_dict()
            for b in backup_svc.prune_backups(
                target, backup_cfg["keep"],
            )
        ]
    return {"backup": info.to_dict(), "removed": removed}


class PruneBody(BaseModel):
    """Explicit prune settings (overrides configured keep)."""
    keep: int | None = None


@router.post("/prune")
def prune_backups(body: PruneBody | None = None):
    """Delete all but the newest ``keep`` backups."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    backup_cfg = settings_svc.get_backup_settings(data)
    keep = (
        body.keep if body and body.keep is not None
        else backup_cfg.get("keep", 0)
    )
    if keep < 0:
        raise HTTPException(
            status_code=400,
            detail="keep must be >= 0",
        )
    target = settings_svc.resolve_backup_dir(data, cfg)
    removed = backup_svc.prune_backups(target, keep)
    return {"removed": [b.to_dict() for b in removed]}


@router.post("/restore/{filename}")
def restore_backup(filename: str):
    """Restore a backup archive into the data directory.

    Only files inside the profile directory are restored.
    External paths (e.g. ~/ownCloud) are NOT part of
    backups and are unaffected.
    """
    if "/" in filename or ".." in filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename",
        )
    path = _backup_dir() / filename
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Backup not found",
        )
    cfg = get_config()
    count = backup_svc.restore_backup(
        path, cfg.DATA_DIR,
    )
    return {
        "restored": count,
        "filename": filename,
    }


@router.get("/download/{filename}")
def download_backup(filename: str):
    """Serve a backup archive for download."""
    # Prevent path traversal — only allow files directly
    # inside the configured backup directory.
    if "/" in filename or ".." in filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename",
        )
    path = _backup_dir() / filename
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Backup not found",
        )
    return FileResponse(
        path,
        media_type="application/zip",
        filename=filename,
    )
