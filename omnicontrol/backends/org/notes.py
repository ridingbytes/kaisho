from pathlib import Path

from ...services import notes as notes_service
from ..base import NotesBackend, TaskBackend


class OrgNotesBackend(NotesBackend):
    """NotesBackend backed by an org-mode notes file."""

    def __init__(self, notes_file: Path) -> None:
        self._notes_file = notes_file

    @property
    def data_file(self) -> Path:
        return self._notes_file

    def list_notes(self) -> list[dict]:
        return notes_service.list_notes(self._notes_file)

    def add_note(
        self,
        title: str,
        body: str = "",
        customer: str | None = None,
        tags: list[str] | None = None,
        task_id: str | None = None,
    ) -> dict:
        return notes_service.add_note(
            notes_file=self._notes_file,
            title=title,
            body=body,
            customer=customer,
            tags=tags,
            task_id=task_id,
        )

    def delete_note(self, note_id: str) -> bool:
        return notes_service.delete_note(self._notes_file, note_id)

    def update_note(self, note_id: str, updates: dict) -> dict:
        return notes_service.update_note(
            notes_file=self._notes_file,
            note_id=note_id,
            updates=updates,
        )

    def promote_to_task(
        self,
        note_id: str,
        tasks: TaskBackend,
        customer: str,
    ) -> dict:
        return notes_service.promote_to_task(
            notes_file=self._notes_file,
            note_id=note_id,
            tasks_backend=tasks,
            customer=customer,
        )
