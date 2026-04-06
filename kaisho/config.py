from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core paths
    ORG_DIR: Path = Path("data/org")
    WISSEN_DIR: Path = Path("data/knowledge")
    RESEARCH_DIR: Path = Path("data/research")
    KUNDEN_DIR: Path = Path("data/kunden")
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    HOST: str = "0.0.0.0"
    PORT: int = 8765
    MARKDOWN_DIR: Path = Path("data/markdown")
    BACKEND: str = "org"  # "org", "markdown", or "json"

    # User/profile selection
    KAISHO_HOME: Path | None = None
    KAISHO_USER: str = "default"
    PROFILE: str = "default"

    @computed_field
    @property
    def DATA_DIR(self) -> Path:
        """Root data dir: KAISHO_HOME > ~/.kaisho > ./data."""
        if self.KAISHO_HOME:
            return self.KAISHO_HOME.expanduser()
        home_dir = Path.home() / ".kaisho"
        if home_dir.is_dir():
            return home_dir
        return _PROJECT_ROOT / "data"

    @computed_field
    @property
    def USER_DIR(self) -> Path:
        return self.DATA_DIR / "users" / self.KAISHO_USER

    @computed_field
    @property
    def USER_FILE(self) -> Path:
        return self.USER_DIR / "user.yaml"

    @computed_field
    @property
    def PROFILE_DIR(self) -> Path:
        return self.USER_DIR / "profiles" / self.PROFILE

    @computed_field
    @property
    def SETTINGS_FILE(self) -> Path:
        return self.PROFILE_DIR / "settings.yaml"

    @computed_field
    @property
    def JOBS_FILE(self) -> Path:
        return self.PROFILE_DIR / "jobs.yaml"

    @computed_field
    @property
    def TODOS_FILE(self) -> Path:
        return self.ORG_DIR.expanduser() / "todos.org"

    @computed_field
    @property
    def CLOCKS_FILE(self) -> Path:
        return self.ORG_DIR.expanduser() / "clocks.org"

    @computed_field
    @property
    def CUSTOMERS_FILE(self) -> Path:
        return self.ORG_DIR.expanduser() / "customers.org"

    @computed_field
    @property
    def INBOX_FILE(self) -> Path:
        return self.ORG_DIR.expanduser() / "inbox.org"

    @computed_field
    @property
    def ARCHIVE_FILE(self) -> Path:
        return self.ORG_DIR.expanduser() / "archive.org"

    @computed_field
    @property
    def NOTES_FILE(self) -> Path:
        return self.ORG_DIR.expanduser() / "notes.org"


@lru_cache(maxsize=1)
def get_config() -> Settings:
    return Settings()


def reset_config() -> Settings:
    """Clear cached config and return a fresh one."""
    get_config.cache_clear()
    return get_config()


# -------------------------------------------------------------------
# User management
# -------------------------------------------------------------------

def _user_template() -> dict:
    return {
        "name": "",
        "email": "",
        "bio": "",
        "created": "",
    }


def load_user_yaml(cfg: Settings | None = None) -> dict:
    """Load user.yaml for the active user."""
    if cfg is None:
        cfg = get_config()
    path = cfg.USER_FILE
    if not path.exists():
        return _user_template()
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return {**_user_template(), **data}


def save_user_yaml(
    cfg: Settings, data: dict
) -> None:
    """Write user.yaml."""
    path = cfg.USER_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(
            data, f,
            default_flow_style=False,
            allow_unicode=True,
        )


def list_users(cfg: Settings | None = None) -> list[dict]:
    """Return list of users with their metadata."""
    if cfg is None:
        cfg = get_config()
    users_dir = cfg.DATA_DIR / "users"
    if not users_dir.is_dir():
        return []
    result = []
    for d in sorted(users_dir.iterdir()):
        if not d.is_dir():
            continue
        user_file = d / "user.yaml"
        if user_file.exists():
            with open(user_file, "r", encoding="utf-8") as f:
                meta = yaml.safe_load(f) or {}
        else:
            meta = {}
        result.append({
            "username": d.name,
            "name": meta.get("name", ""),
            "email": meta.get("email", ""),
            "bio": meta.get("bio", ""),
        })
    return result


def list_profiles(cfg: Settings | None = None) -> list[str]:
    """Return profile names for the active user."""
    if cfg is None:
        cfg = get_config()
    profiles_dir = cfg.USER_DIR / "profiles"
    if not profiles_dir.is_dir():
        return []
    return sorted(
        d.name for d in profiles_dir.iterdir()
        if d.is_dir()
        and (d / "settings.yaml").exists()
    )


def delete_profile(name: str, cfg: Settings | None = None) -> None:
    """Delete a profile directory.

    Raises ValueError if *name* is the currently active profile or
    does not exist.
    """
    import shutil
    if cfg is None:
        cfg = get_config()
    if name == cfg.PROFILE:
        raise ValueError(
            f"Cannot delete the active profile '{name}'"
        )
    profile_dir = cfg.USER_DIR / "profiles" / name
    if not profile_dir.is_dir():
        raise ValueError(f"Profile '{name}' does not exist")
    shutil.rmtree(profile_dir)


def rename_profile(
    old_name: str,
    new_name: str,
    cfg: Settings | None = None,
) -> None:
    """Rename a profile directory.

    Raises ValueError if *old_name* is the active profile, does not
    exist, or *new_name* already exists.
    """
    import re
    if cfg is None:
        cfg = get_config()
    if old_name == cfg.PROFILE:
        raise ValueError(
            f"Cannot rename the active profile '{old_name}'"
        )
    new_name = re.sub(r"[^a-zA-Z0-9_-]", "", new_name.strip())
    if not new_name:
        raise ValueError("New profile name is invalid")
    src = cfg.USER_DIR / "profiles" / old_name
    dst = cfg.USER_DIR / "profiles" / new_name
    if not src.is_dir():
        raise ValueError(f"Profile '{old_name}' does not exist")
    if dst.exists():
        raise ValueError(f"Profile '{new_name}' already exists")
    src.rename(dst)


# -------------------------------------------------------------------
# Init and migration
# -------------------------------------------------------------------

def init_data_dir(cfg: Settings | None = None) -> None:
    """Ensure user/profile dirs exist with template files.

    Also migrates legacy flat profiles if detected.
    """
    import shutil
    from datetime import datetime, timezone
    if cfg is None:
        cfg = get_config()

    # Migrate legacy flat profiles (data/{name}/ → data/users/default/profiles/{name}/)
    _migrate_legacy(cfg)

    # Ensure user dir and user.yaml
    cfg.USER_DIR.mkdir(parents=True, exist_ok=True)
    if not cfg.USER_FILE.exists():
        save_user_yaml(cfg, {
            **_user_template(),
            "name": cfg.KAISHO_USER,
            "created": datetime.now(timezone.utc).isoformat(),
        })

    # Ensure profile dir with templates
    cfg.PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    tmpl = _PROJECT_ROOT / "templates"
    if not tmpl.is_dir():
        return
    for src in tmpl.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(tmpl)
        dst = cfg.PROFILE_DIR / rel
        if dst.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    # Migrate root settings.yaml
    root_settings = _PROJECT_ROOT / "settings.yaml"
    profile_settings = cfg.PROFILE_DIR / "settings.yaml"
    if root_settings.exists() and not profile_settings.exists():
        shutil.move(str(root_settings), str(profile_settings))


def _migrate_legacy(cfg: Settings) -> None:
    """Move old flat data/{profile}/ dirs into users/default/profiles/."""
    import shutil
    data_dir = cfg.DATA_DIR
    if not data_dir.is_dir():
        return
    users_dir = data_dir / "users"
    if users_dir.is_dir():
        return  # already migrated
    # Look for legacy profile dirs (contain settings.yaml)
    legacy_dirs = [
        d for d in data_dir.iterdir()
        if d.is_dir()
        and d.name not in ("users", "markdown")
        and (d / "settings.yaml").exists()
    ]
    if not legacy_dirs:
        return
    default_profiles = users_dir / "default" / "profiles"
    default_profiles.mkdir(parents=True, exist_ok=True)
    for d in legacy_dirs:
        dst = default_profiles / d.name
        if not dst.exists():
            shutil.move(str(d), str(dst))


def load_settings_yaml() -> dict:
    """Read settings.yaml for the active profile."""
    cfg = get_config()
    path = cfg.SETTINGS_FILE
    if not path.exists():
        return {"task_states": [], "tags": []}
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data
