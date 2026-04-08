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
    ) -> None:
        self._todos_file = todos_file
        self._archive_file = archive_file
        self._keywords = keywords

    @property
    def data_file(self) -> Path:
        return self._todos_file

    def list_tasks(
        self,
        status=None,
        customer=None,
        tag=None,
        include_done=False,
    ) -> list[dict]:
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
    ) -> dict:
        return kanban.add_task(
            todos_file=self._todos_file,
            keywords=self._keywords,
            customer=customer,
            title=title,
            status=status,
            tags=tags,
            body=body,
            github_url=github_url,
        )

    def move_task(self, task_id: str, new_status: str) -> dict:
        return kanban.move_task(
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_id=task_id,
            new_status=new_status,
        )

    def set_tags(self, task_id: str, tags: list[str]) -> dict:
        return kanban.set_task_tags(
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_id=task_id,
            tags=tags,
        )

    def reorder_tasks(
        self, task_ids: list[str],
    ) -> list[dict]:
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
        return kanban.archive_task(
            todos_file=self._todos_file,
            archive_file=self._archive_file,
            keywords=self._keywords,
            task_id=task_id,
        )

    def list_all_tags(self) -> list[dict]:
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
        return kanban.list_archived_tasks(
            archive_file=self._archive_file,
            keywords=self._keywords,
        )

    def unarchive_task(self, task_id: str) -> bool:
        return kanban.unarchive_task(
            archive_file=self._archive_file,
            todos_file=self._todos_file,
            keywords=self._keywords,
            task_id=task_id,
        )
