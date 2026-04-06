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
    JOBS_FILE: Path = _PROJECT_ROOT / "jobs.yaml"
    DATA_DIR: Path = _PROJECT_ROOT / "data"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    HOST: str = "0.0.0.0"
    PORT: int = 8765
    MARKDOWN_DIR: Path = Path("data/markdown")
    BACKEND: str = "org"  # "org", "markdown", or "json"
    SETTINGS_FILE: Path = _PROJECT_ROOT / "settings.yaml"

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


def load_settings_yaml() -> dict:
    """Read settings.yaml and return full settings dict."""
    cfg = get_config()
    path = cfg.SETTINGS_FILE.expanduser()
    if not path.exists():
        return {"task_states": [], "tags": []}
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data
