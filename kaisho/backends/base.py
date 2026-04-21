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
    def reorder_tasks(
        self, task_ids: list[str],
    ) -> list[dict]:
        """Reorder tasks within a status column.

        task_ids is the desired order. Returns the
        reordered task list.
        """

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

    @abstractmethod
    def delete_archived_task(self, task_id: str) -> bool:
        """Permanently delete an archived task.

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
        contract: str | None = None,
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
        contract: str | None = None,
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
        contract: str | None = None,
        target_date: date | None = None,
        notes: str | None = None,
        start_time: str | None = None,
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
        start_time: str | None = None,
        task_id: str | None = None,
        invoiced: bool | None = None,
        notes: str | None = None,
        contract: str | None = None,
    ) -> dict | None:
        """Update fields of a clock entry."""

    @abstractmethod
    def delete_entry(self, start_iso: str) -> dict | None:
        """Delete a clock entry by start time.

        Returns the deleted entry (so callers can record a
        sync tombstone) or ``None`` if nothing matched.
        """

    # -- Sync methods -----------------------------------------
    #
    # These are required for bidirectional cloud sync.
    # Every backend must store ``sync_id`` and
    # ``updated_at`` per entry so the sync protocol can
    # identify, merge, and propagate changes.

    def delete_entry_by_sync_id(
        self, sync_id: str,
    ) -> dict | None:
        """Delete a clock entry by its sync UUID.

        Used by the sync protocol when the cloud
        propagates a deletion. Returns the deleted entry
        for tombstone recording, or ``None`` if not found.

        :param sync_id: UUID of the entry to delete.
        :returns: Deleted entry dict, or ``None``.
        """
        # Default: scan all entries and match by sync_id.
        # Backends can override for efficiency.
        entries = self.list_entries(period="all")
        for entry in entries:
            if entry.get("sync_id") == sync_id:
                return self.delete_entry(entry["start"])
        return None

    def apply_sync_payload(
        self, fields: dict,
    ) -> dict:
        """Upsert a cloud-origin entry by sync_id.

        If a local entry with the same ``sync_id``
        exists, apply last-writer-wins. Otherwise insert
        a new entry. Handles the case where a user
        removed the sync_id manually (content-match
        fallback).

        :param fields: Wire payload with ``sync_id``,
            ``start``, ``end``, ``customer``, etc.
        :returns: The resulting entry dict.
        """
        raise NotImplementedError(
            f"{type(self).__name__} does not support "
            f"sync yet. Use the org backend or implement "
            f"apply_sync_payload."
        )


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
        body: str | None = None,
        channel: str | None = None,
        direction: str | None = None,
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
        task_id: str | None = None,
    ) -> dict:
        """Add a new note, return its dict."""

    def reorder_notes(
        self, note_ids: list[str],
    ) -> list[dict]:
        """Reorder notes. Default: no-op, return current."""
        return self.list_notes()

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

        Each dict: name, status, budget, used, rest,
                   repo, properties
        """

    @abstractmethod
    def get_customer(self, name: str) -> dict | None:
        """Return a single customer by name, or None."""

    @abstractmethod
    def get_budget_summary(self) -> list[dict]:
        """Return budget summary for active customers.

        Each dict: {"name": str, "budget": float,
                    "rest": float, "percent": int}
        """

    @abstractmethod
    def add_customer(
        self,
        name: str,
        status: str = "active",
        customer_type: str = "",
        budget: float = 0,
        color: str = "",
        repo: str | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        """Create a new customer. Raises ValueError if name exists."""

    @abstractmethod
    def update_customer(
        self, name: str, updates: dict
    ) -> dict | None:
        """Update a customer's fields.

        Supported keys: name, status, budget, repo.
        Returns the updated customer dict, or None if not found.
        """

    @abstractmethod
    def list_contracts(self, name: str) -> list[dict]:
        """List contracts for a customer."""

    @abstractmethod
    def add_contract(
        self,
        name: str,
        contract_name: str,
        budget: float,
        start_date: str,
        notes: str = "",
        billable: bool = True,
        invoiced: bool = False,
    ) -> dict:
        """Add a named contract to a customer."""

    @abstractmethod
    def update_contract(
        self,
        name: str,
        contract_name: str,
        updates: dict,
    ) -> dict | None:
        """Update contract fields. Returns None if not found."""

    @abstractmethod
    def close_contract(
        self,
        name: str,
        contract_name: str,
        end_date: str,
    ) -> dict | None:
        """Close a contract by setting its end_date."""

    @abstractmethod
    def delete_customer(self, name: str) -> bool:
        """Delete a customer. Returns False if not found."""

    @abstractmethod
    def delete_contract(self, name: str, contract_name: str) -> bool:
        """Delete a contract. Returns False if not found."""
