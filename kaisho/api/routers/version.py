"""Version and changelog API endpoint."""

from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["version"])

# kaisho/api/routers/version.py -> repo root is 3 parents
# up from the kaisho package dir.
_REPO_ROOT = Path(__file__).parent.parent.parent.parent


def _read_version() -> str:
    """Read version from pyproject.toml."""
    toml = _REPO_ROOT / "pyproject.toml"
    if not toml.exists():
        return "dev"
    for line in toml.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("version"):
            return line.split("=")[1].strip().strip('"')
    return "dev"


def _read_changelog() -> str:
    """Read CHANGELOG.md content."""
    path = _REPO_ROOT / "CHANGELOG.md"
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
