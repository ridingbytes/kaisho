from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from .base import (
    ClockBackend,
    CustomerBackend,
    InboxBackend,
    NotesBackend,
    TaskBackend,
)


@dataclass
class Backend:
    """Container for the five domain backends and file-watch paths."""
    tasks: TaskBackend
    clocks: ClockBackend
    inbox: InboxBackend
    customers: CustomerBackend
    notes: NotesBackend
    watch_paths: list[Path] = field(default_factory=list)


def reset_backend() -> Backend:
    """Clear the cached backend and return a fresh one.

    Also resets the config cache so .env changes take effect.
    """
    from ..config import reset_config
    reset_config()
    get_backend.cache_clear()
    return get_backend()


@lru_cache(maxsize=1)
def get_backend() -> Backend:
    """Return the singleton Backend for the configured backend type.

    Reads the backend type and paths from the profile's
    settings.yaml so each profile can use a different backend.
    Falls back to the global config (.env) when not set.
    """
    from ..config import get_config
    return _build_backend(get_config())


def make_backend_for_profile(
    data_dir: Path, profile_name: str,
) -> Backend:
    """Build an uncached Backend for a specific profile.

    Used by the multi-profile sync loop to read/write
    data for inactive profiles without touching the
    global ``get_backend()`` cache.

    :param data_dir: Kaisho data directory
        (e.g. ``~/.kaisho``).
    :param profile_name: Profile name.
    :returns: Fresh Backend instance.
    """
    from ..config import get_config

    cfg = get_config()
    profile_dir = data_dir / "profiles" / profile_name

    overlay = _ProfileOverlayCfg(
        cfg, profile_name, profile_dir,
    )
    return _build_backend(overlay)


class _ProfileOverlayCfg:
    """Read-only config proxy targeting a specific profile.

    Overrides PROFILE, PROFILE_DIR, and SETTINGS_FILE.
    All other attributes delegate to the real config.
    Do not set attributes on this proxy.
    """

    def __init__(
        self, cfg, profile_name: str,
        profile_dir: Path,
    ):
        object.__setattr__(self, "_cfg", cfg)
        object.__setattr__(self, "_name", profile_name)
        object.__setattr__(self, "_dir", profile_dir)

    def __getattr__(self, name):
        if name == "PROFILE":
            return object.__getattribute__(
                self, "_name",
            )
        if name == "PROFILE_DIR":
            return object.__getattribute__(
                self, "_dir",
            )
        if name == "SETTINGS_FILE":
            return (
                object.__getattribute__(self, "_dir")
                / "settings.yaml"
            )
        return getattr(
            object.__getattribute__(self, "_cfg"),
            name,
        )


def _build_backend(cfg) -> Backend:
    """Build a Backend from a config object.

    :param cfg: Config with SETTINGS_FILE and
        PROFILE_DIR attributes.
    :returns: Backend instance.
    """
    from ..services.settings import (
        get_path_settings, load_settings,
    )

    data = load_settings(cfg.SETTINGS_FILE)
    paths = get_path_settings(data, cfg)
    backend_type = paths["backend"].lower()

    cfg_overlay = _OverlayCfg(cfg, paths)

    if backend_type == "org":
        from .org import make_org_backend
        result = make_org_backend(cfg_overlay)
    elif backend_type == "markdown":
        from .markdown import make_markdown_backend
        result = make_markdown_backend(cfg_overlay)
    elif backend_type == "json":
        from .json_backend import make_json_backend
        result = make_json_backend(cfg_overlay)
    elif backend_type == "sql":
        from .sql import make_sql_backend
        dsn = getattr(cfg_overlay, "SQL_DSN", "")
        if not dsn:
            db_path = (
                cfg.PROFILE_DIR / "kaisho.db"
            )
            dsn = f"sqlite:///{db_path.as_posix()}"
        result = make_sql_backend(dsn)
    else:
        raise ValueError(
            f"Unknown backend: {backend_type!r}"
        )

    tasks, clocks, inbox, customers, notes, watch = result
    return Backend(
        tasks=tasks,
        clocks=clocks,
        inbox=inbox,
        customers=customers,
        notes=notes,
        watch_paths=watch,
    )


_ORG_FILE_MAP = {
    "TODOS_FILE": "todos.org",
    "CLOCKS_FILE": "clocks.org",
    "CUSTOMERS_FILE": "customers.org",
    "INBOX_FILE": "inbox.org",
    "ARCHIVE_FILE": "archive.org",
    "NOTES_FILE": "notes.org",
}


class _OverlayCfg:
    """Thin wrapper over Settings that overrides paths.

    Delegates all attribute access to the real config except
    for the paths that were overridden in the profile's
    settings.yaml. Also re-derives org file paths when
    ORG_DIR is overridden.
    """

    def __init__(self, cfg, paths: dict):
        object.__setattr__(self, "_cfg", cfg)
        object.__setattr__(self, "_paths", paths)

    def __getattr__(self, name):
        cfg = object.__getattribute__(self, "_cfg")
        paths = object.__getattribute__(self, "_paths")
        if name == "ORG_DIR" and paths.get("org_dir"):
            return Path(paths["org_dir"])
        if name == "MARKDOWN_DIR" and paths.get("markdown_dir"):
            return Path(paths["markdown_dir"])
        if name == "JSON_DIR" and paths.get("json_dir"):
            return Path(paths["json_dir"])
        if name == "SQL_DSN" and paths.get("sql_dsn"):
            return paths["sql_dsn"]
        if name == "BACKEND":
            return paths.get("backend", "org")
        # Re-derive org file paths from overridden ORG_DIR
        if name in _ORG_FILE_MAP and paths.get("org_dir"):
            org = Path(paths["org_dir"])
            return org / _ORG_FILE_MAP[name]
        return getattr(cfg, name)
