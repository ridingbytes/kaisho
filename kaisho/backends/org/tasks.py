from pathlib import Path

from ...services import kanban
from ..base import TaskBackend


class OrgTaskBackend(TaskBackend):
    """TaskBackend backed by an org-mode todos file."""

    def __init__(
        self,
        todos_file: Path,
        archive_file: Path,
        keywords: set[str],
        clocks_file: Path | None = None,
    ) -> None:
        self._todos_file = todos_file
        self._archive_file = archive_file
        self._keywords = keywords
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        """Return the todos org-mode file path."""
        return self._todos_file

    def list_tasks(
        self,
        status=None,
        customer=None,
        tag=None,
        include_done=False,
    ) -> list[dict]:
        """Return tasks matching the given filters."""
        return kanban.list_tasks(
            todos_file=self._todos_file,
            keywords=self._keywords,
            status=status,
            customer=customer,
            tag=tag,
            include_done=include_done,
        )

    def add_task(
        self,
        customer: str,
        title: str,
        status: str = "TODO",
        tags: list[str] | None = None,
        body: str | None = None,
        github_url: str | None = None,
        sync_id: str | None = None,
    ) -> dict:
        """Create a new task and return its dict."""
        return kanban.add_task(
            todos_file=self._todos_file,
            keywords=self._keywords,
            customer=customer,
            title=title,
            status=status,
            tags=tags,
            body=body,
            github_url=github_url,
            sync_id=sync_id,
        )

    def move_task(self, task_id: str, new_status: str) -> dict:
        """Change a task's status and return updated dict."""
        return kanban.move_task(
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_id=task_id,
            new_status=new_status,
        )

    def set_tags(self, task_id: str, tags: list[str]) -> dict:
        """Replace all tags on a task and return updated dict."""
        return kanban.set_task_tags(
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_id=task_id,
            tags=tags,
        )

    def reorder_tasks(
        self, task_ids: list[str],
    ) -> list[dict]:
        """Reorder tasks by the given ID sequence."""
        return kanban.reorder_tasks(
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_ids=task_ids,
        )

    def update_task(
        self, task_id: str,
        title: str | None = None,
        customer: str | None = None,
        body: str | None = None,
        github_url: str | None = None,
    ) -> dict:
        """Update a task's fields and return updated dict."""
        return kanban.update_task(
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_id=task_id,
            title=title,
            customer=customer,
            body=body,
            github_url=github_url,
        )

    def archive_task(self, task_id: str) -> bool:
        """Move task to the archive file. Return False if not found."""
        return kanban.archive_task(
            todos_file=self._todos_file,
            archive_file=self._archive_file,
            keywords=self._keywords,
            task_id=task_id,
        )

    def list_all_tags(self) -> list[dict]:
        """Return all tags with usage counts."""
        tasks = self.list_tasks(include_done=True)
        counts: dict[str, int] = {}
        for task in tasks:
            for tag in task.get("tags") or []:
                counts[tag] = counts.get(tag, 0) + 1
        return [
            {"name": name, "count": count}
            for name, count in sorted(counts.items())
        ]

    def list_archived(self) -> list[dict]:
        """Return all archived tasks."""
        return kanban.list_archived_tasks(
            archive_file=self._archive_file,
            keywords=self._keywords,
            clocks_file=self._clocks_file,
        )

    def unarchive_task(self, task_id: str) -> bool:
        """Restore an archived task. Return False if not found."""
        return kanban.unarchive_task(
            archive_file=self._archive_file,
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_id=task_id,
        )

    def delete_archived_task(self, task_id: str) -> bool:
        """Permanently delete an archived task."""
        return kanban.delete_archived_task(
            archive_file=self._archive_file,
            keywords=self._keywords,
            task_id=task_id,
        )
