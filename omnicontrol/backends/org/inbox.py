import re
from pathlib import Path

from ...org.parser import parse_org_file
from ...org.writer import write_org_file
from ...services import inbox
from ...services.inbox import INBOX_KEYWORDS
from ..base import InboxBackend, TaskBackend


_CUSTOMER_PREFIX_RE = re.compile(r"^\[[^\]]+\]\s*")


class OrgInboxBackend(InboxBackend):
    """InboxBackend backed by an org-mode inbox file."""

    def __init__(self, inbox_file: Path) -> None:
        self._inbox_file = inbox_file

    @property
    def data_file(self) -> Path:
        return self._inbox_file

    def list_items(self) -> list[dict]:
        return inbox.list_items(inbox_file=self._inbox_file)

    def add_item(
        self,
        text: str,
        item_type: str | None = None,
        customer: str | None = None,
        body: str | None = None,
        channel: str | None = None,
        direction: str | None = None,
    ) -> dict:
        return inbox.add_item(
            inbox_file=self._inbox_file,
            text=text,
            item_type=item_type,
            customer=customer,
            body=body,
            channel=channel,
            direction=direction,
        )

    def update_item(self, item_id: str, updates: dict) -> dict:
        return inbox.update_item(
            inbox_file=self._inbox_file,
            item_id=item_id,
            updates=updates,
        )

    def remove_item(self, item_id: str) -> bool:
        if not self._inbox_file.exists():
            return False
        org_file = parse_org_file(self._inbox_file, INBOX_KEYWORDS)
        idx = int(item_id) - 1
        if idx < 0 or idx >= len(org_file.headings):
            return False
        org_file.headings.pop(idx)
        write_org_file(self._inbox_file, org_file)
        return True

    def promote_to_task(
        self,
        item_id: str,
        tasks: TaskBackend,
        customer: str,
    ) -> dict:
        """Promote inbox item to task via the given TaskBackend.

        Using the TaskBackend interface keeps this operation
        backend-agnostic: any task backend can receive the promoted item.
        """
        if not self._inbox_file.exists():
            raise ValueError("Inbox file not found")

        org_file = parse_org_file(self._inbox_file, INBOX_KEYWORDS)
        idx = int(item_id) - 1
        if idx < 0 or idx >= len(org_file.headings):
            raise ValueError(f"Item not found: {item_id}")

        heading = org_file.headings[idx]
        title = heading.title.strip()
        clean_title = _CUSTOMER_PREFIX_RE.sub("", title)

        body = "\n".join(heading.body).strip() or None

        task = tasks.add_task(
            customer=customer,
            title=clean_title,
            status="TODO",
            body=body,
        )

        org_file.headings.pop(idx)
        write_org_file(self._inbox_file, org_file)

        return task
