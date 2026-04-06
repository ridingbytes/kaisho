from pathlib import Path

from ...services import customers
from ..base import CustomerBackend


class OrgCustomerBackend(CustomerBackend):
    """CustomerBackend backed by an org-mode kunden file."""

    def __init__(self, kunden_file: Path, clocks_file: Path) -> None:
        self._kunden_file = kunden_file
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        return self._kunden_file

    def list_customers(
        self, include_inactive: bool = False
    ) -> list[dict]:
        return customers.list_customers(
            kunden_file=self._kunden_file,
            clocks_file=self._clocks_file,
            include_inactive=include_inactive,
        )

    def get_customer(self, name: str) -> dict | None:
        return customers.get_customer(
            kunden_file=self._kunden_file,
            clocks_file=self._clocks_file,
            name=name,
        )

    def get_budget_summary(self) -> list[dict]:
        return customers.get_budget_summary(
            kunden_file=self._kunden_file,
            clocks_file=self._clocks_file,
        )

    def add_customer(
        self,
        name: str,
        status: str = "active",
        customer_type: str = "",
        budget: float = 0,
        repo: str | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        return customers.add_customer(
            kunden_file=self._kunden_file,
            name=name,
            status=status,
            customer_type=customer_type,
            budget=budget,
            repo=repo,
            tags=tags,
        )

    def update_customer(
        self, name: str, updates: dict
    ) -> dict | None:
        return customers.update_customer(
            kunden_file=self._kunden_file,
            name=name,
            updates=updates,
        )

    def list_contracts(self, name: str) -> list[dict]:
        return customers.list_contracts(
            self._kunden_file, self._clocks_file, name
        )

    def add_contract(
        self,
        name: str,
        contract_name: str,
        budget: float,
        start_date: str,
        notes: str = "",
    ) -> dict:
        return customers.add_contract(
            self._kunden_file, name, contract_name,
            budget, start_date, notes,
        )

    def update_contract(
        self, name: str, contract_name: str, updates: dict
    ) -> dict | None:
        return customers.update_contract(
            self._kunden_file, name, contract_name, updates
        )

    def close_contract(
        self, name: str, contract_name: str, end_date: str
    ) -> dict | None:
        return customers.close_contract(
            self._kunden_file, name, contract_name, end_date
        )

    def delete_contract(self, name: str, contract_name: str) -> bool:
        return customers.delete_contract(
            self._kunden_file, name, contract_name
        )
