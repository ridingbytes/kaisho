"""Abstract base classes for storage backends.

Implement these four ABCs to plug in any file format or data store.
The org-mode backend (backends/org/) is the reference implementation.
"""
from abc import ABC, abstractmethod
from datetime import date
from pathlib import Path


class TaskBackend(ABC):
    """Read/write tasks (kanban items)."""

    @property
    def data_file(self) -> Path | None:
        """Primary file for this backend, used by 'edit' commands.

        Return None if the backend has no single editable file
        (e.g. a database backend).
        """
        return None

    @abstractmethod
    def list_tasks(
        self,
        status: list[str] | None = None,
        customer: str | None = None,
        tag: str | None = None,
        include_done: bool = False,
    ) -> list[dict]:
        """Return tasks matching the given filters.

        Each dict contains at minimum:
          id, customer, title, status, tags, properties, created
        """

    @abstractmethod
    def add_task(
        self,
        customer: str,
        title: str,
        status: str = "TODO",
        tags: list[str] | None = None,
        body: str | None = None,
        github_url: str | None = None,
    ) -> dict:
        """Create and persist a new task, return its dict."""

    @abstractmethod
    def move_task(self, task_id: str, new_status: str) -> dict:
        """Change the status of a task, return updated dict."""

    @abstractmethod
    def set_tags(self, task_id: str, tags: list[str]) -> dict:
        """Replace all tags on a task, return updated dict."""

    @abstractmethod
    def archive_task(self, task_id: str) -> bool:
        """Remove task from active store.  Return False if not found."""

    @abstractmethod
    def update_task(
        self, task_id: str,
        title: str | None = None,
        customer: str | None = None,
        body: str | None = None,
        github_url: str | None = None,
    ) -> dict:
        """Update a task's title, customer, and/or body."""

    @abstractmethod
    def list_all_tags(self) -> list[dict]:
        """Return tags with usage counts.

        Each dict: {"name": str, "count": int}
        """

    @abstractmethod
    def list_archived(self) -> list[dict]:
        """Return archived tasks.

        Each dict is like a task dict plus:
          archived_at, archive_status
        """

    @abstractmethod
    def unarchive_task(self, task_id: str) -> bool:
        """Restore an archived task to the active store.

        Return False if not found.
        """


class ClockBackend(ABC):
    """Read/write time-tracking clock entries."""

    @property
    def data_file(self) -> Path | None:
        """Primary file for this backend, used by 'edit' commands."""
        return None

    @abstractmethod
    def list_entries(
        self,
        period: str = "today",
        customer: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        task_id: str | None = None,
    ) -> list[dict]:
        """Return clock entries for the given period and filters.

        period: "today" | "week" | "month" (ignored when from/to or
        task_id given).
        Each dict: customer, description, start, end,
                   duration_minutes, task_id
        """

    @abstractmethod
    def get_active(self) -> dict | None:
        """Return the currently open (running) clock entry, or None."""

    @abstractmethod
    def get_summary(self, period: str = "month") -> list[dict]:
        """Return hours per customer for the period.

        Each dict: {"customer": str, "minutes": int, "hours": float}
        """

    @abstractmethod
    def start(
        self,
        customer: str,
        description: str,
        task_id: str | None = None,
    ) -> dict:
        """Open a new clock entry (raises ValueError if one is running)."""

    @abstractmethod
    def stop(self) -> dict:
        """Close the running clock entry (raises ValueError if none)."""

    @abstractmethod
    def quick_book(
        self,
        duration_str: str,
        customer: str,
        description: str,
        task_id: str | None = None,
    ) -> dict:
        """Book time retroactively.  duration_str e.g. "2h", "30min"."""

    @abstractmethod
    def update_entry(
        self,
        start_iso: str,
        customer: str | None = None,
        description: str | None = None,
        hours: float | None = None,
        new_date: date | None = None,
        task_id: str | None = None,
        booked: bool | None = None,
        notes: str | None = None,
    ) -> dict | None:
        """Update customer, description, hours, date, task, booked, or notes."""

    @abstractmethod
    def delete_entry(self, start_iso: str) -> bool:
        """Delete a clock entry by start time. Return False if not found."""


class InboxBackend(ABC):
    """Read/write inbox capture items."""

    @property
    def data_file(self) -> Path | None:
        """Primary file for this backend, used by 'edit' commands."""
        return None

    @abstractmethod
    def list_items(self) -> list[dict]:
        """Return all inbox items.

        Each dict: id, type, customer, title, created, properties
        """

    @abstractmethod
    def add_item(
        self,
        text: str,
        item_type: str | None = None,
        customer: str | None = None,
    ) -> dict:
        """Capture a new inbox item, return its dict."""

    @abstractmethod
    def remove_item(self, item_id: str) -> bool:
        """Delete an inbox item.  Return False if not found."""

    @abstractmethod
    def update_item(self, item_id: str, updates: dict) -> dict:
        """Update fields of an inbox item. Return updated dict."""

    @abstractmethod
    def promote_to_task(
        self,
        item_id: str,
        tasks: TaskBackend,
        customer: str,
    ) -> dict:
        """Convert inbox item to a task and remove it from inbox.

        Uses *tasks* backend to create the task so the operation
        works across any backend combination.
        """


class NotesBackend(ABC):
    """Read/write notes."""

    @property
    def data_file(self) -> Path | None:
        """Primary file for this backend."""
        return None

    @abstractmethod
    def list_notes(self) -> list[dict]:
        """Return all notes.

        Each dict: id, title, customer, body, created
        """

    @abstractmethod
    def add_note(
        self,
        title: str,
        body: str = "",
        customer: str | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        """Add a new note, return its dict."""

    @abstractmethod
    def delete_note(self, note_id: str) -> bool:
        """Delete a note. Return False if not found."""

    @abstractmethod
    def update_note(self, note_id: str, updates: dict) -> dict:
        """Update fields of a note. Return updated dict."""

    @abstractmethod
    def promote_to_task(
        self,
        note_id: str,
        tasks: TaskBackend,
        customer: str,
    ) -> dict:
        """Promote a note to a task and remove it from notes."""


class CustomerBackend(ABC):
    """Read customer / budget data (typically read-only)."""

    @property
    def data_file(self) -> Path | None:
        """Primary file for this backend, used by 'edit' commands."""
        return None

    @abstractmethod
    def list_customers(
        self, include_inactive: bool = False
    ) -> list[dict]:
        """Return customers.

        Each dict: name, status, kontingent, verbraucht, rest,
                   repo, properties
        """

    @abstractmethod
    def get_customer(self, name: str) -> dict | None:
        """Return a single customer by name, or None."""

    @abstractmethod
    def get_budget_summary(self) -> list[dict]:
        """Return budget summary for active customers.

        Each dict: {"name": str, "kontingent": float,
                    "rest": float, "percent": int}
        """

    @abstractmethod
    def add_customer(
        self,
        name: str,
        status: str = "active",
        kontingent: float = 0,
        repo: str | None = None,
    ) -> dict:
        """Create a new customer. Raises ValueError if name exists."""

    @abstractmethod
    def update_customer(
        self, name: str, updates: dict
    ) -> dict | None:
        """Update a customer's fields.

        Supported keys: name, status, kontingent, repo.
        Returns the updated customer dict, or None if not found.
        """

    @abstractmethod
    def list_time_entries(self, name: str) -> list[dict]:
        """List time entries for a customer.

        Each dict: id, description, hours, date
        """

    @abstractmethod
    def add_time_entry(
        self, name: str, description: str, hours: float,
        date: str | None = None,
    ) -> dict:
        """Add a time entry to a customer.

        Returns the created entry dict.
        """

    @abstractmethod
    def update_time_entry(
        self,
        name: str,
        entry_id: str,
        description: str | None = None,
        hours: float | None = None,
        date: str | None = None,
    ) -> dict | None:
        """Update fields of a time entry. Returns None if not found."""

    @abstractmethod
    def delete_time_entry(self, name: str, entry_id: str) -> bool:
        """Delete a time entry. Returns False if not found."""
