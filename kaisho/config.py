import sys
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _get_project_root() -> Path:
    """Return the project root, handling PyInstaller."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent.parent


_PROJECT_ROOT = _get_project_root()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core paths
    ORG_DIR: Path = Path("data/org")
    KNOWLEDGE_DIR: Path = Path("data/knowledge")
    RESEARCH_DIR: Path = Path("data/research")
    CUSTOMERS_DIR: Path = Path("data/customers")
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    HOST: str = "0.0.0.0"
    PORT: int = 8765
    MARKDOWN_DIR: Path = Path("data/markdown")
    JSON_DIR: Path = Path("data/json")
    BACKEND: str = "org"
    SQL_DSN: str = ""

    # Profile selection (single user, multiple profiles)
    KAISHO_HOME: Path | None = None
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
    def PROFILE_DIR(self) -> Path:
        return self.DATA_DIR / "profiles" / self.PROFILE

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
# User metadata (single user)
# -------------------------------------------------------------------

def _user_template() -> dict:
    return {
        "name": "",
        "email": "",
        "bio": "",
        "avatar_seed": "",
        "created": "",
    }


def load_user_yaml(
    cfg: Settings | None = None,
) -> dict:
    """Load user.yaml from the data directory."""
    if cfg is None:
        cfg = get_config()
    path = cfg.DATA_DIR / "user.yaml"
    if not path.exists():
        return _user_template()
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return {**_user_template(), **data}


def save_user_yaml(
    cfg: Settings, data: dict,
) -> None:
    """Write user.yaml to the data directory."""
    path = cfg.DATA_DIR / "user.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(
            data, f,
            default_flow_style=False,
            allow_unicode=True,
        )


# -------------------------------------------------------------------
# Profile management
# -------------------------------------------------------------------

def load_active_profile(
    data_dir: Path,
) -> str | None:
    """Return the persisted active profile name."""
    f = data_dir / ".active_profile"
    if f.exists():
        name = f.read_text(encoding="utf-8").strip()
        if name:
            return name
    return None


def resolve_active_profile(
    data_dir: Path,
) -> str:
    """Return a valid profile name.

    Reads the persisted selection and validates it
    still exists on disk. Falls back to the first
    existing profile, or "default".
    """
    profiles_dir = data_dir / "profiles"
    saved = load_active_profile(data_dir)
    if saved and (profiles_dir / saved).is_dir():
        return saved
    if profiles_dir.is_dir():
        existing = sorted(
            d.name for d in profiles_dir.iterdir()
            if d.is_dir()
        )
        if existing:
            return existing[0]
    return "default"


def save_active_profile(
    data_dir: Path, name: str,
) -> None:
    """Persist the active profile selection."""
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / ".active_profile").write_text(
        name, encoding="utf-8",
    )


def list_profiles(
    cfg: Settings | None = None,
) -> list[str]:
    """Return profile names."""
    if cfg is None:
        cfg = get_config()
    profiles_dir = cfg.DATA_DIR / "profiles"
    if not profiles_dir.is_dir():
        return []
    return sorted(
        d.name for d in profiles_dir.iterdir()
        if d.is_dir()
        and (d / "settings.yaml").exists()
    )


def delete_profile(
    name: str, cfg: Settings | None = None,
) -> None:
    """Delete a profile directory."""
    import shutil
    if cfg is None:
        cfg = get_config()
    if name == cfg.PROFILE:
        raise ValueError(
            f"Cannot delete the active profile"
            f" '{name}'"
        )
    profile_dir = (
        cfg.DATA_DIR / "profiles" / name
    )
    if not profile_dir.is_dir():
        raise ValueError(
            f"Profile '{name}' does not exist"
        )
    shutil.rmtree(profile_dir)


def copy_profile(
    source: str,
    target: str,
    cfg: Settings | None = None,
) -> None:
    """Copy a profile directory."""
    import re
    import shutil
    if cfg is None:
        cfg = get_config()
    target = re.sub(
        r"[^a-zA-Z0-9_-]", "", target.strip(),
    )
    if not target:
        raise ValueError(
            "Target profile name is invalid"
        )
    src = cfg.DATA_DIR / "profiles" / source
    dst = cfg.DATA_DIR / "profiles" / target
    if not src.is_dir():
        raise ValueError(
            f"Profile '{source}' does not exist"
        )
    if dst.exists():
        raise ValueError(
            f"Profile '{target}' already exists"
        )
    shutil.copytree(src, dst)


def rename_profile(
    old_name: str,
    new_name: str,
    cfg: Settings | None = None,
) -> None:
    """Rename a profile directory."""
    import re
    if cfg is None:
        cfg = get_config()
    if old_name == cfg.PROFILE:
        raise ValueError(
            f"Cannot rename the active profile"
            f" '{old_name}'"
        )
    new_name = re.sub(
        r"[^a-zA-Z0-9_-]", "", new_name.strip(),
    )
    if not new_name:
        raise ValueError(
            "New profile name is invalid"
        )
    src = cfg.DATA_DIR / "profiles" / old_name
    dst = cfg.DATA_DIR / "profiles" / new_name
    if not src.is_dir():
        raise ValueError(
            f"Profile '{old_name}' does not exist"
        )
    if dst.exists():
        raise ValueError(
            f"Profile '{new_name}' already exists"
        )
    src.rename(dst)


# -------------------------------------------------------------------
# Init
# -------------------------------------------------------------------

def init_data_dir(
    cfg: Settings | None = None,
) -> None:
    """Ensure profile dir exists with template files."""
    import shutil
    if cfg is None:
        cfg = get_config()

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


def load_settings_yaml() -> dict:
    """Read settings.yaml for the active profile."""
    cfg = get_config()
    path = cfg.SETTINGS_FILE
    if not path.exists():
        return {"task_states": [], "tags": []}
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data
