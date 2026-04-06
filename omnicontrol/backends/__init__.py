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
    """Return the singleton Backend for the configured backend type."""
    from ..config import get_config
    cfg = get_config()
    backend_type = getattr(cfg, "BACKEND", "org").lower()

    if backend_type == "org":
        from .org import make_org_backend
        tasks, clocks, inbox, customers, notes, watch = make_org_backend(cfg)
    elif backend_type == "markdown":
        from .markdown import make_markdown_backend
        tasks, clocks, inbox, customers, notes, watch = (
            make_markdown_backend(cfg)
        )
    elif backend_type == "json":
        from .json_backend import make_json_backend
        tasks, clocks, inbox, customers, notes, watch = (
            make_json_backend(cfg)
        )
    else:
        raise ValueError(
            f"Unknown backend: {backend_type!r}"
        )

    return Backend(
        tasks=tasks,
        clocks=clocks,
        inbox=inbox,
        customers=customers,
        notes=notes,
        watch_paths=watch,
    )
