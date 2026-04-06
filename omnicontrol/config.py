from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root: parent of this file's parent directory
_PROJECT_ROOT = Path(__file__).parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ORG_DIR: Path = Path("~/ownCloud/cowork/org")
    WISSEN_DIR: Path = Path("~/ownCloud/cowork/wissen")
    RESEARCH_DIR: Path = Path("~/ownCloud/cowork/research")
    KUNDEN_DIR: Path = Path("~/ownCloud/cowork/kunden")
    DATA_DIR: Path = _PROJECT_ROOT / "data"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    HOST: str = "0.0.0.0"
    PORT: int = 8765
    MARKDOWN_DIR: Path = Path("data/markdown")
    BACKEND: str = "org"  # "org", "markdown", or "json"
    PROFILE: str = "default"

    @computed_field
    @property
    def PROFILE_DIR(self) -> Path:
        return self.DATA_DIR.expanduser() / self.PROFILE

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
    def KUNDEN_FILE(self) -> Path:
        return self.ORG_DIR.expanduser() / "kunden.org"

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

    @computed_field
    @property
    def DB_FILE(self) -> Path:
        return self.DATA_DIR.expanduser() / "omnicontrol.db"


@lru_cache(maxsize=1)
def get_config() -> Settings:
    return Settings()


def reset_config() -> Settings:
    """Clear the cached config and return a fresh one."""
    get_config.cache_clear()
    return get_config()


def init_data_dir(cfg: Settings | None = None) -> None:
    """Ensure the profile directory exists and is populated.

    1. Migrate legacy root-level files into the profile dir
    2. Copy any missing template files
    """
    import shutil
    if cfg is None:
        cfg = get_config()
    profile_dir = cfg.PROFILE_DIR
    profile_dir.mkdir(parents=True, exist_ok=True)
    data_dir = cfg.DATA_DIR.expanduser()

    # Migrate legacy files from data/ root into profile
    _LEGACY = [
        "settings.yaml", "jobs.yaml",
        "SOUL.md", "USER.md",
    ]
    for name in _LEGACY:
        src = data_dir / name
        dst = profile_dir / name
        if src.exists() and not dst.exists():
            shutil.move(str(src), str(dst))
    # Migrate SKILLS/ directory
    legacy_skills = data_dir / "SKILLS"
    profile_skills = profile_dir / "SKILLS"
    if legacy_skills.is_dir() and not profile_skills.is_dir():
        shutil.move(str(legacy_skills), str(profile_skills))
    # Migrate root settings.yaml (project root)
    root_settings = Path(__file__).parent.parent / "settings.yaml"
    profile_settings = profile_dir / "settings.yaml"
    if root_settings.exists() and not profile_settings.exists():
        shutil.move(str(root_settings), str(profile_settings))

    # Copy templates for missing files
    tmpl = Path(__file__).parent.parent / "templates"
    if not tmpl.is_dir():
        return
    for src in tmpl.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(tmpl)
        dst = profile_dir / rel
        if dst.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def list_profiles(cfg: Settings | None = None) -> list[str]:
    """Return available profile names."""
    if cfg is None:
        cfg = get_config()
    data = cfg.DATA_DIR.expanduser()
    if not data.is_dir():
        return []
    return sorted(
        d.name for d in data.iterdir()
        if d.is_dir()
        and (d / "settings.yaml").exists()
    )


def load_settings_yaml() -> dict:
    """Read settings.yaml and return full settings dict."""
    cfg = get_config()
    path = cfg.SETTINGS_FILE
    if not path.exists():
        return {"task_states": [], "tags": []}
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data
