"""General settings router.

Handles paths, backend switching, data import, GitHub,
knowledge base sources, advisor personality files, URL
allowlist, and invoice export configuration.

State/tag CRUD is in settings_states.py, AI settings
in settings_ai.py, and user/profiles in
settings_profiles.py.
"""
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import settings as settings_svc

router = APIRouter(
    prefix="/api/settings", tags=["settings"],
)


# ── General ──────────────────────────────────────────


@router.get("")
def get_settings():
    """Return all application settings."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    merged = dict(data)
    if not isinstance(merged.get("task_states"), list):
        merged["task_states"] = []
    if not isinstance(merged.get("tags"), list):
        merged["tags"] = []
    merged["customer_types"] = (
        settings_svc.get_customer_types(data)
    )
    merged["inbox_types"] = (
        settings_svc.get_inbox_types(data)
    )
    merged["inbox_channels"] = (
        settings_svc.get_inbox_channels(data)
    )
    return merged


# ── Invoice export ───────────────────────────────────


class ExportColumn(BaseModel):
    field: str
    format: str | None = None


class InvoiceExportUpdate(BaseModel):
    columns: list[ExportColumn]


@router.get("/invoice_export")
def get_invoice_export():
    """Return invoice export column settings."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_invoice_export_settings(data)


@router.patch("/invoice_export")
def update_invoice_export(body: InvoiceExportUpdate):
    """Update invoice export column configuration."""
    cfg = get_config()
    columns = [
        c.model_dump(exclude_none=True)
        for c in body.columns
    ]
    return settings_svc.set_invoice_export_settings(
        cfg.SETTINGS_FILE, {"columns": columns},
    )


# ── Paths and backend ───────────────────────────────


@router.get("/paths")
def get_paths():
    """Return path and backend config for the profile."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    paths = settings_svc.get_path_settings(data, cfg)
    sql_dsn = paths.get("sql_dsn", "")
    if not sql_dsn:
        db_path = cfg.PROFILE_DIR / "kaisho.db"
        sql_dsn = f"sqlite:///{db_path.as_posix()}"
    return {
        "org_dir": paths["org_dir"],
        "markdown_dir": paths["markdown_dir"],
        "json_dir": paths["json_dir"],
        "sql_dsn": sql_dsn,
        "data_dir": str(cfg.DATA_DIR.expanduser()),
        "profile": cfg.PROFILE,
        "profile_dir": str(cfg.PROFILE_DIR),
        "settings_file": str(cfg.SETTINGS_FILE),
        "backend": paths["backend"],
    }


class PathsUpdate(BaseModel):
    org_dir: str | None = None
    markdown_dir: str | None = None
    json_dir: str | None = None
    sql_dsn: str | None = None
    backend: str | None = None


@router.patch("/paths")
def update_paths(body: PathsUpdate):
    """Save path/backend settings to settings.yaml."""
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return {"message": "Nothing to update."}
    settings_svc.set_path_settings(
        cfg.SETTINGS_FILE, updates,
    )
    from ...backends import reset_backend
    reset_backend()
    return {"message": "Paths saved."}


class BackendSwitch(BaseModel):
    backend: str


@router.put("/backend")
def switch_backend(body: BackendSwitch):
    """Switch the storage backend for this profile."""
    valid = ("org", "markdown", "json", "sql")
    if body.backend not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"backend must be one of: {valid}",
        )
    cfg = get_config()
    settings_svc.set_path_settings(
        cfg.SETTINGS_FILE,
        {"backend": body.backend},
    )
    from ...backends import reset_backend
    reset_backend()
    return {
        "backend": body.backend,
        "message": (
            f"Switched to {body.backend} backend."
        ),
    }


# ── Import data ──────────────────────────────────────


class ImportData(BaseModel):
    source_format: str
    source_path: str


@router.post("/import-data")
def import_data(body: ImportData):
    """Import data from another backend."""
    valid = ("org", "markdown", "json", "sql")
    if body.source_format not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"Format must be one of: {valid}",
        )
    from ...backends import get_backend
    from ...services.convert import (
        convert_backend,
        make_backend_from_spec,
    )
    from ...config import get_config
    source = make_backend_from_spec(
        body.source_format, body.source_path,
    )
    target = get_backend()
    cfg = get_config()
    summary = convert_backend(
        source, target,
        settings_file=cfg.SETTINGS_FILE,
    )
    return {"summary": summary}


# ── GitHub ───────────────────────────────────────────


@router.get("/github")
def get_github():
    """Return GitHub integration settings."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    result = settings_svc.get_github_settings(data)
    token = result.get("token", "")
    result["token_set"] = bool(token)
    if token:
        result["token"] = "..." + token[-4:]
    return result


class GithubSettingsUpdate(BaseModel):
    token: str | None = None
    base_url: str | None = None


@router.patch("/github")
def update_github(body: GithubSettingsUpdate):
    """Update GitHub integration settings."""
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    return settings_svc.set_github_settings(
        cfg.SETTINGS_FILE, updates,
    )


# ── Knowledge base sources ───────────────────────────


@router.get("/kb_sources")
def get_kb_sources():
    """Return configured knowledge base sources."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_kb_sources(data, cfg)


@router.put("/kb_sources")
def set_kb_sources(body: list[dict] = Body(...)):
    """Replace the list of knowledge base sources."""
    cfg = get_config()
    return settings_svc.set_kb_sources(
        cfg.SETTINGS_FILE, body,
    )


# ── Advisor personality files ────────────────────────


class AdvisorFilesUpdate(BaseModel):
    soul: str | None = None
    user: str | None = None


def _advisor_file_path(filename: str) -> Path:
    """Return the path to an advisor file."""
    cfg = get_config()
    return cfg.PROFILE_DIR / filename


def _read_advisor_file(filename: str) -> str:
    """Read an advisor personality file."""
    path = _advisor_file_path(filename)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _write_advisor_file(
    filename: str, content: str,
) -> None:
    """Write an advisor personality file."""
    path = _advisor_file_path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@router.get("/advisor_files")
def get_advisor_files():
    """Return SOUL.md and USER.md personality files."""
    return {
        "soul": _read_advisor_file("SOUL.md"),
        "user": _read_advisor_file("USER.md"),
    }


@router.put("/advisor_files")
def put_advisor_files(body: AdvisorFilesUpdate):
    """Save SOUL.md and USER.md personality files."""
    if body.soul is not None:
        _write_advisor_file("SOUL.md", body.soul)
    if body.user is not None:
        _write_advisor_file("USER.md", body.user)
    return {
        "soul": _read_advisor_file("SOUL.md"),
        "user": _read_advisor_file("USER.md"),
    }


# ── Backup ───────────────────────────────────────────


class BackupSettingsUpdate(BaseModel):
    directory: str | None = None
    keep: int | None = None
    interval_hours: int | None = None


@router.get("/backup")
def get_backup_settings():
    """Return backup schedule settings."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    result = settings_svc.get_backup_settings(data)
    resolved = settings_svc.resolve_backup_dir(data, cfg)
    result["resolved_directory"] = str(resolved)
    return result


@router.patch("/backup")
def update_backup_settings(body: BackupSettingsUpdate):
    """Update backup schedule settings."""
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    if "keep" in updates and updates["keep"] < 0:
        raise HTTPException(
            status_code=400,
            detail="keep must be >= 0",
        )
    if (
        "interval_hours" in updates
        and updates["interval_hours"] < 0
    ):
        raise HTTPException(
            status_code=400,
            detail="interval_hours must be >= 0",
        )
    updated = settings_svc.set_backup_settings(
        cfg.SETTINGS_FILE, updates,
    )
    # Reschedule periodic backup if it changed.
    try:
        from ...cron.scheduler import sync_backup_job
        sync_backup_job()
    except Exception as exc:  # noqa: BLE001
        # Scheduler may not be running (tests, CLI) —
        # settings are still persisted in that case.
        import logging
        logging.getLogger(__name__).debug(
            "sync_backup_job skipped: %s", exc,
        )
    return updated


# ── URL allowlist ────────────────────────────────────


@router.get("/url_allowlist")
def get_url_allowlist():
    """Return the URL allowlist for web scraping."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_url_allowlist(data)


@router.put("/url_allowlist")
def set_url_allowlist(body: list[str] = Body(...)):
    """Replace the URL allowlist for web scraping."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    data["url_allowlist"] = body
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return body
