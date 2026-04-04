"""Markdown backend stub.

Implement the four classes below to support markdown files as the
data source.  Each method raises NotImplementedError until done.

Suggested file layout (one markdown file per domain):
  todos.md   — tasks with YAML front-matter or checkbox syntax
  clocks.md  — time-log table or front-matter blocks
  inbox.md   — flat list of capture items
  kunden.md  — customer / budget table

Set BACKEND=markdown in .env to activate.
"""
from datetime import date
from pathlib import Path

from ..base import (
    ClockBackend,
    CustomerBackend,
    InboxBackend,
    TaskBackend,
)


class MarkdownTaskBackend(TaskBackend):
    def __init__(self, todos_file: Path) -> None:
        self._todos_file = todos_file

    @property
    def data_file(self) -> Path:
        return self._todos_file

    def list_tasks(self, status=None, customer=None,
                   tag=None, include_done=False) -> list[dict]:
        raise NotImplementedError

    def add_task(self, customer, title, status="TODO",
                 tags=None) -> dict:
        raise NotImplementedError

    def move_task(self, task_id, new_status) -> dict:
        raise NotImplementedError

    def set_tags(self, task_id, tags) -> dict:
        raise NotImplementedError

    def archive_task(self, task_id) -> bool:
        raise NotImplementedError

    def update_task(self, task_id, title=None,
                    customer=None) -> dict:
        raise NotImplementedError

    def list_all_tags(self) -> list[dict]:
        raise NotImplementedError


class MarkdownClockBackend(ClockBackend):
    def __init__(self, clocks_file: Path) -> None:
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        return self._clocks_file

    def list_entries(self, period="today", customer=None,
                     from_date: date | None = None,
                     to_date: date | None = None) -> list[dict]:
        raise NotImplementedError

    def get_active(self) -> dict | None:
        raise NotImplementedError

    def get_summary(self, period="month") -> list[dict]:
        raise NotImplementedError

    def start(self, customer, description) -> dict:
        raise NotImplementedError

    def stop(self) -> dict:
        raise NotImplementedError

    def quick_book(self, duration_str, customer,
                   description) -> dict:
        raise NotImplementedError

    def update_entry(self, start_iso, description=None,
                     hours=None) -> dict | None:
        raise NotImplementedError

    def delete_entry(self, start_iso) -> bool:
        raise NotImplementedError


class MarkdownInboxBackend(InboxBackend):
    def __init__(self, inbox_file: Path) -> None:
        self._inbox_file = inbox_file

    @property
    def data_file(self) -> Path:
        return self._inbox_file

    def list_items(self) -> list[dict]:
        raise NotImplementedError

    def add_item(self, text, item_type=None,
                 customer=None) -> dict:
        raise NotImplementedError

    def remove_item(self, item_id) -> bool:
        raise NotImplementedError

    def promote_to_task(self, item_id, tasks, customer) -> dict:
        raise NotImplementedError


class MarkdownCustomerBackend(CustomerBackend):
    def __init__(self, kunden_file: Path) -> None:
        self._kunden_file = kunden_file

    @property
    def data_file(self) -> Path:
        return self._kunden_file

    def list_customers(self, include_inactive=False) -> list[dict]:
        raise NotImplementedError

    def get_customer(self, name) -> dict | None:
        raise NotImplementedError

    def get_budget_summary(self) -> list[dict]:
        raise NotImplementedError

    def update_customer(self, name, updates) -> dict | None:
        raise NotImplementedError

    def list_time_entries(self, name) -> list[dict]:
        raise NotImplementedError

    def add_time_entry(self, name, description, hours,
                       date=None) -> dict:
        raise NotImplementedError

    def update_time_entry(self, name, entry_id, description=None,
                          hours=None, date=None) -> dict | None:
        raise NotImplementedError

    def delete_time_entry(self, name, entry_id) -> bool:
        raise NotImplementedError


def make_markdown_backend(cfg) -> tuple[
    TaskBackend, ClockBackend, InboxBackend,
    MarkdownCustomerBackend, list[Path],
]:
    """Build markdown backends from config paths."""
    md_dir = cfg.ORG_DIR.expanduser()
    tasks = MarkdownTaskBackend(md_dir / "todos.md")
    clocks = MarkdownClockBackend(md_dir / "clocks.md")
    inbox = MarkdownInboxBackend(md_dir / "inbox.md")
    cust = MarkdownCustomerBackend(md_dir / "kunden.md")
    watch_paths = [md_dir, cfg.SETTINGS_FILE.expanduser()]
    return tasks, clocks, inbox, cust, watch_paths
