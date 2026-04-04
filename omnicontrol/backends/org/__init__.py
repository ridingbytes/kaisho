from pathlib import Path

from ...config import Settings, load_settings_yaml
from ...org.parser import KEYWORDS as DEFAULT_KEYWORDS
from ...services.settings import get_state_names
from ..base import (
    ClockBackend,
    CustomerBackend,
    InboxBackend,
    TaskBackend,
)
from .clocks import OrgClockBackend
from .customers import OrgCustomerBackend
from .inbox import OrgInboxBackend
from .tasks import OrgTaskBackend


def _keywords(cfg: Settings) -> set[str]:
    """Resolve task keywords from settings.yaml or fall back to defaults."""
    names = get_state_names(load_settings_yaml())
    return set(names) if names else DEFAULT_KEYWORDS


def make_org_backend(cfg: Settings) -> tuple[
    TaskBackend, ClockBackend, InboxBackend, CustomerBackend, list[Path]
]:
    """Build the four org backends and the list of paths to watch."""
    kw = _keywords(cfg)
    tasks = OrgTaskBackend(cfg.TODOS_FILE, cfg.ARCHIVE_FILE, kw)
    clocks = OrgClockBackend(cfg.CLOCKS_FILE)
    inbox = OrgInboxBackend(cfg.INBOX_FILE)
    cust = OrgCustomerBackend(cfg.KUNDEN_FILE)
    watch_paths = [
        cfg.ORG_DIR.expanduser(),
        cfg.SETTINGS_FILE.expanduser(),
    ]
    for kb_dir in (cfg.WISSEN_DIR, cfg.RESEARCH_DIR):
        expanded = kb_dir.expanduser()
        if expanded.is_dir():
            watch_paths.append(expanded)
    return tasks, clocks, inbox, cust, watch_paths
