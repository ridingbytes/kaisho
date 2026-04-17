"""Version and changelog API endpoint."""

import sys
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["version"])


def _base_dir() -> Path:
    """Return the base directory for data files.

    Handles both normal and PyInstaller-frozen contexts.
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent.parent.parent.parent


def _read_version() -> str:
    """Read version from pyproject.toml."""
    toml = _base_dir() / "pyproject.toml"
    if not toml.exists():
        return "dev"
    for line in toml.read_text(
        encoding="utf-8",
    ).splitlines():
        if line.strip().startswith("version"):
            return line.split("=")[1].strip().strip('"')
    return "dev"


def _read_changelog() -> str:
    """Read CHANGELOG.md content."""
    path = _base_dir() / "CHANGELOG.md"
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


@router.get("/version")
def get_version():
    """Return current version and changelog."""
    return {
        "version": _read_version(),
        "changelog": _read_changelog(),
    }
