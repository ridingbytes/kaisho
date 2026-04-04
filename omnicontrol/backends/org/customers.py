from pathlib import Path

from ...services import customers
from ..base import CustomerBackend


class OrgCustomerBackend(CustomerBackend):
    """CustomerBackend backed by an org-mode kunden file."""

    def __init__(self, kunden_file: Path) -> None:
        self._kunden_file = kunden_file

    @property
    def data_file(self) -> Path:
        return self._kunden_file

    def list_customers(
        self, include_inactive: bool = False
    ) -> list[dict]:
        return customers.list_customers(
            kunden_file=self._kunden_file,
            include_inactive=include_inactive,
        )

    def get_customer(self, name: str) -> dict | None:
        return customers.get_customer(
            kunden_file=self._kunden_file,
            name=name,
        )

    def get_budget_summary(self) -> list[dict]:
        return customers.get_budget_summary(
            kunden_file=self._kunden_file
        )

    def add_customer(
        self,
        name: str,
        status: str = "active",
        kontingent: float = 0,
        repo: str | None = None,
    ) -> dict:
        return customers.add_customer(
            kunden_file=self._kunden_file,
            name=name,
            status=status,
            kontingent=kontingent,
            repo=repo,
        )

    def update_customer(
        self, name: str, updates: dict
    ) -> dict | None:
        return customers.update_customer(
            kunden_file=self._kunden_file,
            name=name,
            updates=updates,
        )

    def list_time_entries(self, name: str) -> list[dict]:
        return customers.list_time_entries(
            kunden_file=self._kunden_file,
            name=name,
        )

    def add_time_entry(
        self, name: str, description: str, hours: float,
        date: str | None = None,
    ) -> dict:
        return customers.add_time_entry(
            kunden_file=self._kunden_file,
            name=name,
            description=description,
            hours=hours,
            entry_date=date,
        )

    def update_time_entry(
        self,
        name: str,
        entry_id: str,
        description: str | None = None,
        hours: float | None = None,
        date: str | None = None,
    ) -> dict | None:
        return customers.update_time_entry(
            kunden_file=self._kunden_file,
            name=name,
            entry_id=entry_id,
            description=description,
            hours=hours,
            entry_date=date,
        )

    def delete_time_entry(self, name: str, entry_id: str) -> bool:
        return customers.delete_time_entry(
            kunden_file=self._kunden_file,
            name=name,
            entry_id=entry_id,
        )
