"""MkDocs hook: inject version from pyproject.toml into extra."""
import re
from pathlib import Path


def on_config(config):
    """Read version from pyproject.toml and set extra.version."""
    root = Path(__file__).parent.parent.parent
    toml = (root / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version\s*=\s*"([^"]+)"', toml, re.M)
    if match:
        config.extra["app_version"] = match.group(1)
    return config
