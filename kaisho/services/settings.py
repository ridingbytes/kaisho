import os
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path

import yaml

# Serialises the whole load -> modify -> save cycle.
# Every settings block (ai, cloud_sync, task_states, …)
# lives in one YAML file, so two requests writing
# different blocks concurrently would each load, merge
# their own block, and save — last writer silently
# dropping the other's change. Re-entrant so a mutator
# that itself calls another settings helper doesn't
# deadlock.
_settings_lock = threading.RLock()

# Settings YAML holds plaintext credentials (Ollama keys,
# Claude/OpenAI/OpenRouter keys, GitHub PAT, cloud-sync
# token). Lock both the file and its parent directory to
# the current user. 0o600 = rw for owner only; 0o700 = rwx
# for owner only on the directory.
_SETTINGS_FILE_MODE = 0o600
_SETTINGS_DIR_MODE = 0o700

DEFAULT_CUSTOMER_TYPES: list[str] = [
    "LEAD", "CLIENT", "PROSPECT", "PARTNER", "INTERN",
]

DEFAULT_INBOX_TYPES: list[str] = [
    "NOTE", "EMAIL", "LEAD", "IDEA",
    "BUG", "FEATURE",
]

DEFAULT_INBOX_CHANNELS: list[str] = [
    "email", "phone", "chat", "meeting",
    "github", "slack",
]

DEFAULT_AI: dict = {
    "ollama_url": "",
    "ollama_cloud_url": "",
    "ollama_api_key": "",
    "ollama_cloud_api_key": "",
    "lm_studio_url": "",
    "claude_api_key": "",
    "openrouter_url": "",
    "openrouter_api_key": "",
    "openai_url": "",
    "openai_api_key": "",
    "brave_api_key": "",
    "tavily_api_key": "",
    "advisor_model": "",
    "cron_model": "",
}


def load_settings(path: Path) -> dict:
    """Load settings from a YAML file."""
    if not path.exists():
        return {"task_states": [], "tags": []}
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if _migrate_ollama_cloud_key(data):
        save_settings(path, data)
    return data


def _migrate_ollama_cloud_key(data: dict) -> bool:
    """One-shot migration for an old form-binding bug.

    Before the fix, the "Ollama Cloud Key" input wrote into
    ``ai.ollama_api_key`` (the local key field). Anyone who
    set up Ollama Cloud during that window has the cloud
    value sitting in the local-key slot, and after upgrade
    Ollama Cloud requests authenticate with no key (HTTP
    403 Forbidden).

    Move ``ollama_api_key`` → ``ollama_cloud_api_key`` when
    we are confident it was meant for the cloud:
    - a cloud URL is configured
    - no local URL (otherwise the local key may be a real
      authenticated local Ollama with no cloud key entered
      yet)
    - the cloud key slot is empty
    - the local key slot has a value

    Returns True if anything was migrated, so the caller
    can persist the updated dict.
    """
    ai = data.get("ai") or {}
    if not isinstance(ai, dict):
        return False
    cloud_url = ai.get("ollama_cloud_url", "") or ""
    local_url = ai.get("ollama_url", "") or ""
    cloud_key = ai.get("ollama_cloud_api_key", "") or ""
    local_key = ai.get("ollama_api_key", "") or ""
    if not cloud_url:
        return False
    if local_url:
        return False
    if cloud_key:
        return False
    if not local_key:
        return False
    ai["ollama_cloud_api_key"] = local_key
    ai["ollama_api_key"] = ""
    data["ai"] = ai
    return True


def save_settings(path: Path, settings: dict) -> None:
    """Save settings to a YAML file atomically.

    The file holds plaintext credentials, so we lock the
    parent directory to 0o700 and the file itself to 0o600
    after every write. ``chmod`` is best-effort on
    platforms where it is a no-op (Windows) -- the file
    will still be created, just without POSIX permissions.

    Written via a temp file + ``os.replace`` so a crash
    mid-write can't leave a truncated / corrupt settings
    file (the rename is atomic on the same filesystem).
    """
    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True)
    _restrict_path_mode(parent, _SETTINGS_DIR_MODE)
    fd, tmp = tempfile.mkstemp(
        dir=parent, prefix=".settings-", suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            yaml.dump(
                settings, f,
                allow_unicode=True,
                default_flow_style=False,
            )
        _restrict_path_mode(Path(tmp), _SETTINGS_FILE_MODE)
        os.replace(tmp, path)
    except BaseException:
        # Don't leave the temp file behind on failure.
        Path(tmp).unlink(missing_ok=True)
        raise
    _restrict_path_mode(path, _SETTINGS_FILE_MODE)


def mutate_settings(path: Path, mutator) -> dict:
    """Atomically apply ``mutator`` to the settings dict.

    Loads the settings, calls ``mutator(data)`` (which
    mutates ``data`` in place), and saves — all under the
    settings lock so concurrent writers can't drop each
    other's changes. Returns the saved dict so callers can
    derive their response from it.
    """
    with _settings_lock:
        data = load_settings(path)
        mutator(data)
        save_settings(path, data)
        return data


def _update_block(
    path: Path, key: str, updates: dict,
) -> dict:
    """Merge ``updates`` into the ``key`` block and save,
    atomically and under the lock. Returns the saved
    settings dict. Covers the common shallow-merge writer;
    blocks needing custom merge logic (e.g. ``ai``, which
    skips empty secrets) use :func:`mutate_settings`.
    """
    def _apply(data: dict) -> None:
        block = data.get(key, {})
        block.update(updates)
        data[key] = block

    return mutate_settings(path, _apply)


@contextmanager
def settings_transaction(path: Path):
    """Hold the settings lock for a multi-step read-modify-
    save that the simple ``mutate_settings`` callback can't
    express (e.g. validate-then-conditionally-save).

    Yields the loaded settings dict; the caller mutates it
    and calls :func:`save_settings` inside the ``with``
    block. The lock is held for the whole body so the
    load and the save are one critical section.
    """
    with _settings_lock:
        yield load_settings(path)


def settings_lock():
    """Return the re-entrant lock guarding the settings
    read-modify-write cycle.

    For callers that keep their own inline ``load_settings``
    / ``save_settings`` pair (e.g. the states / tags API
    handlers) and just need to serialise the whole cycle
    against concurrent writers. Re-entrant, so a handler
    holding it can still call service helpers that take it
    again.
    """
    return _settings_lock


def _restrict_path_mode(path: Path, mode: int) -> None:
    """Best-effort ``chmod`` that tolerates platforms
    where POSIX permissions are not enforced (e.g. Windows
    on a FAT volume). Any OS error is logged at debug and
    swallowed so a hardened-perms tightening cannot break
    settings writes on those platforms."""
    try:
        os.chmod(path, mode)
    except OSError:
        # Windows / non-POSIX filesystems: nothing to do.
        pass


def get_task_states(settings: dict) -> list[dict]:
    """Return task_states list from settings."""
    return settings.get("task_states", [])


def get_tags(settings: dict) -> list[dict]:
    """Return tags list from settings."""
    return settings.get("tags", [])


def get_state_names(settings: dict) -> list[str]:
    """Return list of all state names."""
    return [s["name"] for s in get_task_states(settings)]


def get_done_state_names(settings: dict) -> list[str]:
    """Return list of state names marked as done."""
    return [
        s["name"]
        for s in get_task_states(settings)
        if s.get("done", False)
    ]


def get_customer_types(settings: dict) -> list[str]:
    """Return customer_types list with defaults."""
    return settings.get("customer_types", list(DEFAULT_CUSTOMER_TYPES))


def get_inbox_types(settings: dict) -> list[str]:
    """Return inbox_types list with defaults."""
    return settings.get(
        "inbox_types", list(DEFAULT_INBOX_TYPES),
    )


def get_inbox_channels(settings: dict) -> list[str]:
    """Return inbox_channels list with defaults."""
    return settings.get(
        "inbox_channels",
        list(DEFAULT_INBOX_CHANNELS),
    )


# Keys that contain secrets and must never be
# returned in API responses.
_SECRET_KEYS = {
    "api_key", "claude_api_key", "openrouter_api_key",
    "openai_api_key", "ollama_api_key",
    "ollama_cloud_api_key",
    "brave_api_key", "tavily_api_key", "token",
}


def _mask_secrets(data: dict) -> dict:
    """Replace secret values with ``*_set`` booleans plus
    a short preview suffix.

    Recursively walks dicts. Any key in ``_SECRET_KEYS``
    is replaced with:

    - ``<key>_set: bool`` — backwards-compatible flag
    - ``<key>_preview: str`` — last 4 characters of the
      stored value (or empty string), so the UI can show
      ``••••XXXX`` and the user can recognise their key
      without exposing the full value

    The raw value is never returned.
    """
    out = {}
    for k, v in data.items():
        if k in _SECRET_KEYS:
            value = v or ""
            out[f"{k}_set"] = bool(value)
            out[f"{k}_preview"] = (
                value[-4:] if len(value) >= 4 else ""
            )
        elif isinstance(v, dict):
            out[k] = _mask_secrets(v)
        else:
            out[k] = v
    return out


def clear_ai_key(path: Path, field: str) -> dict:
    """Wipe a single AI secret key. Returns the masked
    AI block. Raises ``ValueError`` if ``field`` is not a
    known secret key, so callers can map to a 400 response.
    """
    if field not in _SECRET_KEYS:
        raise ValueError(f"unknown secret key: {field}")

    def _apply(data: dict) -> None:
        ai = data.get("ai", {}) or {}
        ai[field] = ""
        data["ai"] = ai

    data = mutate_settings(path, _apply)
    return get_ai_settings_safe(data)


def get_ai_settings(settings: dict) -> dict:
    """Return AI settings with defaults filled in.

    Raw keys are included for internal use. API
    endpoints should call ``get_ai_settings_safe``
    instead.
    """
    return {**DEFAULT_AI, **settings.get("ai", {})}


def get_ai_settings_safe(settings: dict) -> dict:
    """Return AI settings with secrets masked."""
    return _mask_secrets(get_ai_settings(settings))


def set_ai_settings(path: Path, updates: dict) -> dict:
    """Persist AI settings updates.

    Empty-string secret fields are skipped so that the
    frontend can submit forms without clearing keys it
    didn't change (the GET response masks them).

    :returns: The full ai block (with secrets masked).
    """
    def _apply(data: dict) -> None:
        ai = data.get("ai", {})
        for k, v in updates.items():
            if k in _SECRET_KEYS and v == "":
                continue
            ai[k] = v
        data["ai"] = ai

    data = mutate_settings(path, _apply)
    return get_ai_settings_safe(data)


DEFAULT_CLOUD_SYNC: dict = {
    "enabled": False,
    "url": "https://cloud.kaisho.dev",
    "api_key": "",
    "interval": 300,
}


def get_cloud_sync_settings(settings: dict) -> dict:
    """Return cloud sync settings with defaults."""
    raw = {
        **DEFAULT_CLOUD_SYNC,
        **settings.get("cloud_sync", {}),
    }
    return {
        "enabled": raw["enabled"],
        "url": raw["url"],
        "api_key_set": bool(raw.get("api_key")),
        "interval": raw["interval"],
    }


def get_cloud_sync_key(settings: dict) -> str:
    """Return the raw cloud sync API key."""
    return settings.get("cloud_sync", {}).get(
        "api_key", "",
    )


def set_cloud_sync_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist cloud sync settings; return new block."""
    def _apply(data: dict) -> None:
        sync = data.get("cloud_sync", {})
        sync.update(updates)
        data["cloud_sync"] = sync

    data = mutate_settings(path, _apply)
    return get_cloud_sync_settings(data)


DEFAULT_BACKUP: dict = {
    # Empty string -> resolve to DATA_DIR / "backups" at
    # runtime via resolve_backup_dir().
    "directory": "",
    "keep": 10,
    # 0 disables the scheduled backup job.
    "interval_hours": 24,
}


def get_backup_settings(settings: dict) -> dict:
    """Return backup settings with defaults filled in."""
    return {
        **DEFAULT_BACKUP, **settings.get("backup", {}),
    }


def set_backup_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist backup settings updates; return the new block."""
    return get_backup_settings(
        _update_block(path, "backup", updates),
    )


def resolve_backup_dir(settings: dict, cfg=None) -> Path:
    """Return the absolute backup directory path.

    Uses ``backup.directory`` from settings when set,
    otherwise ``DATA_DIR / "backups"``.
    """
    if cfg is None:
        from ..config import get_config
        cfg = get_config()
    raw = get_backup_settings(settings).get(
        "directory", "",
    )
    if raw:
        return Path(raw).expanduser()
    return cfg.DATA_DIR / "backups"


DEFAULT_CLOCKS: dict = {
    # Round stopped clock entries to N-minute buckets.
    # 0 disables rounding. Allowed: 0, 15, 30, 60.
    "rounding_minutes": 0,
    # How to round: "nearest" (half-up), "up" (ceil), or
    # "down" (floor). Ignored when rounding_minutes == 0.
    "rounding_mode": "nearest",
}


def get_clocks_settings(settings: dict) -> dict:
    """Return clock settings with defaults filled in."""
    return {**DEFAULT_CLOCKS, **settings.get("clocks", {})}


def get_rounding(settings: dict) -> tuple[int, str]:
    """Return ``(rounding_minutes, rounding_mode)``.

    Coerces values to safe defaults so callers can pass
    the tuple straight to ``stop_timer`` without
    re-validating.
    """
    block = get_clocks_settings(settings)
    minutes = int(block.get("rounding_minutes", 0) or 0)
    mode = str(block.get("rounding_mode", "nearest"))
    if mode not in ("nearest", "up", "down"):
        mode = "nearest"
    return minutes, mode


def set_clocks_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist clock settings updates; return the new block."""
    return get_clocks_settings(
        _update_block(path, "clocks", updates),
    )


DEFAULT_INVOICE_EXPORT: dict = {
    "columns": [
        {"field": "date"},
        {"field": "start_time"},
        {"field": "end_time"},
        {"field": "customer"},
        {"field": "description"},
        {"field": "contract"},
        {"field": "task"},
        {"field": "hours"},
    ],
}


def get_invoice_export_settings(settings: dict) -> dict:
    """Return invoice export column config."""
    return {
        **DEFAULT_INVOICE_EXPORT,
        **settings.get("invoice_export", {}),
    }


def set_invoice_export_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist invoice export settings."""
    return get_invoice_export_settings(
        _update_block(path, "invoice_export", updates),
    )


DEFAULT_GITHUB: dict = {
    "token": "",
    "base_url": "https://api.github.com",
}


def get_github_settings(settings: dict) -> dict:
    """Return GitHub settings with defaults filled in."""
    return {**DEFAULT_GITHUB, **settings.get("github", {})}


def set_github_settings(path: Path, updates: dict) -> dict:
    """Persist GitHub settings updates; return the new full block."""
    return get_github_settings(
        _update_block(path, "github", updates),
    )


# ── External editor ─────────────────────────────────────

DEFAULT_EXTERNAL_EDITOR = {
    "enabled": False,
    "command": "",
}


def get_external_editor_settings(settings: dict) -> dict:
    """Return external-editor settings with defaults
    filled in. The ``command`` is a shell-style template
    with a ``{file}`` placeholder, e.g.
    ``alacritty -e nvim "{file}"``."""
    return {
        **DEFAULT_EXTERNAL_EDITOR,
        **settings.get("external_editor", {}),
    }


def set_external_editor_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist external-editor settings updates."""
    return get_external_editor_settings(
        _update_block(path, "external_editor", updates),
    )


def current_kb_sources() -> list[dict]:
    """Convenience: load the active profile's settings and
    return its KB sources. Removes the duplicated 3-line
    bootstrap from the API router and CLI."""
    from ..config import get_config
    cfg = get_config()
    data = load_settings(cfg.SETTINGS_FILE)
    return get_kb_sources(data, cfg)


def get_kb_sources(settings: dict, cfg=None) -> list[dict]:
    """Return KB source list with defaults.

    Each entry: {"label": str, "path": str}.
    Default: a per-profile ``knowledge`` folder under the
    profile dir. Users can override or add more sources
    via Settings -> Paths.
    """
    sources = settings.get("kb_sources")
    if sources:
        return sources
    if cfg is None:
        from ..config import get_config
        cfg = get_config()
    profile_kb = cfg.PROFILE_DIR / "knowledge"
    profile_kb.mkdir(parents=True, exist_ok=True)
    defaults = [
        {
            "label": "knowledge",
            "path": str(profile_kb),
        },
    ]
    # Migration safeguard: if a pre-1.4.x install left
    # populated content in the shared ``~/.kaisho/knowledge``
    # dir, expose it as an extra source so users do not
    # silently lose access after upgrading. Empty/absent
    # legacy dirs are skipped so new profiles stay clean.
    legacy = cfg.DATA_DIR / "knowledge"
    if legacy != profile_kb and legacy.is_dir():
        if any(legacy.iterdir()):
            defaults.append({
                "label": "shared",
                "path": str(legacy),
            })
    return defaults


def set_kb_sources(path: Path, sources: list[dict]) -> list[dict]:
    """Persist KB sources; return the updated list."""
    mutate_settings(
        path, lambda data: data.update(kb_sources=sources),
    )
    return sources


DEFAULT_PATHS: dict = {
    "backend": "org",
    "org_dir": "",
    "markdown_dir": "",
    "json_dir": "",
    "sql_dsn": "",
}


def _default_org_dir(cfg) -> str:
    """Profile-local org dir, unless an explicit env override exists."""
    builtin = Path("data/org").expanduser()
    if cfg.ORG_DIR.expanduser() != builtin:
        return str(cfg.ORG_DIR.expanduser())
    return str(cfg.PROFILE_DIR / "org")


def _default_markdown_dir(cfg) -> str:
    """Profile-local markdown dir."""
    builtin = Path("data/markdown").expanduser()
    if cfg.MARKDOWN_DIR.expanduser() != builtin:
        return str(cfg.MARKDOWN_DIR.expanduser())
    return str(cfg.PROFILE_DIR / "markdown")


def _default_json_dir(cfg) -> str:
    """Profile-local JSON dir."""
    builtin = Path("data/json").expanduser()
    if cfg.JSON_DIR.expanduser() != builtin:
        return str(cfg.JSON_DIR.expanduser())
    return str(cfg.PROFILE_DIR / "json")


def get_path_settings(settings: dict, cfg=None) -> dict:
    """Return backend/path settings with defaults.

    Keys: backend, org_dir, markdown_dir, json_dir.
    Each defaults to a subdirectory inside PROFILE_DIR
    so each profile keeps its data isolated.
    """
    if cfg is None:
        from ..config import get_config
        cfg = get_config()
    stored = settings.get("paths", {})
    return {
        "backend": (
            stored.get("backend") or cfg.BACKEND
        ),
        "org_dir": (
            stored.get("org_dir")
            or _default_org_dir(cfg)
        ),
        "markdown_dir": (
            stored.get("markdown_dir")
            or _default_markdown_dir(cfg)
        ),
        "json_dir": (
            stored.get("json_dir")
            or _default_json_dir(cfg)
        ),
        "sql_dsn": stored.get("sql_dsn", ""),
    }


def set_path_settings(
    path: Path, updates: dict,
) -> dict:
    """Persist path/backend settings."""
    def _apply(data: dict) -> None:
        paths = data.get("paths", {})
        for key in (
            "backend", "org_dir",
            "markdown_dir", "json_dir", "sql_dsn",
        ):
            if key in updates and updates[key] is not None:
                paths[key] = updates[key]
        data["paths"] = paths

    data = mutate_settings(path, _apply)
    return get_path_settings(data)


def get_url_allowlist(settings: dict) -> list[str]:
    """Return the URL allowlist (list of domain strings)."""
    return settings.get("url_allowlist", [])


def add_to_url_allowlist(path: Path, domain: str) -> list[str]:
    """Add a domain to the URL allowlist and return the list."""
    result: list[str] = []

    def _apply(data: dict) -> None:
        allowlist = data.get("url_allowlist", [])
        if domain not in allowlist:
            allowlist.append(domain)
        data["url_allowlist"] = allowlist
        result.extend(allowlist)

    mutate_settings(path, _apply)
    return result
