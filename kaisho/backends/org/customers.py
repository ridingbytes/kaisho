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
        """Return the kunden org-mode file path."""
        return self._kunden_file

    def list_customers(
        self, include_inactive: bool = False
    ) -> list[dict]:
        """Return customers, optionally including inactive."""
        return customers.list_customers(
            kunden_file=self._kunden_file,
            clocks_file=self._clocks_file,
            include_inactive=include_inactive,
        )

    def get_customer(self, name: str) -> dict | None:
        """Return a single customer by name, or None."""
        return customers.get_customer(
            kunden_file=self._kunden_file,
            clocks_file=self._clocks_file,
            name=name,
        )

    def get_budget_summary(self) -> list[dict]:
        """Return budget summary for active customers."""
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
        color: str = "",
        repo: str | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        """Create a new customer. Raises ValueError if exists."""
        return customers.add_customer(
            kunden_file=self._kunden_file,
            name=name,
            status=status,
            customer_type=customer_type,
            budget=budget,
            color=color,
            repo=repo,
            tags=tags,
        )

    def update_customer(
        self, name: str, updates: dict
    ) -> dict | None:
        """Update customer fields. Return None if not found."""
        return customers.update_customer(
            kunden_file=self._kunden_file,
            name=name,
            updates=updates,
        )

    def list_contracts(self, name: str) -> list[dict]:
        """Return all contracts for a customer."""
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
        billable: bool = True,
        invoiced: bool = False,
    ) -> dict:
        """Add a named contract to a customer."""
        return customers.add_contract(
            self._kunden_file, name, contract_name,
            budget, start_date, notes, billable,
            invoiced,
        )

    def update_contract(
        self, name: str, contract_name: str, updates: dict
    ) -> dict | None:
        """Update contract fields, cascading name renames to clocks."""
        result = customers.update_contract(
            self._kunden_file, name,
            contract_name, updates,
        )
        if result and "name" in updates:
            new_name = updates["name"]
            if new_name != contract_name:
                self._rename_contract_in_clocks(
                    name, contract_name, new_name,
                )
        return result

    def _rename_contract_in_clocks(
        self,
        customer: str,
        old_name: str,
        new_name: str,
    ) -> None:
        """Update CONTRACT property in clock entries."""
        from ...org.parser import parse_org_file
        from ...org.writer import write_org_file

        if not self._clocks_file.exists():
            return
        KEYWORDS: set[str] = set()
        org_file = parse_org_file(
            self._clocks_file, KEYWORDS,
        )
        changed = False
        for h in org_file.headings:
            if h.properties.get("CONTRACT") == old_name:
                h.properties["CONTRACT"] = new_name
                h.dirty = True
                changed = True
        if changed:
            write_org_file(self._clocks_file, org_file)

    def close_contract(
        self, name: str, contract_name: str, end_date: str
    ) -> dict | None:
        """Close a contract by setting its end date."""
        return customers.close_contract(
            self._kunden_file, name, contract_name, end_date
        )

    def delete_customer(self, name: str) -> bool:
        """Delete a customer. Return False if not found."""
        return customers.delete_customer(
            self._kunden_file, name
        )

    def delete_contract(self, name: str, contract_name: str) -> bool:
        """Delete a contract. Return False if not found."""
        return customers.delete_contract(
            self._kunden_file, name, contract_name
        )
