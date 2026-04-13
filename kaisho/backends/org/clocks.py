from datetime import date
from pathlib import Path

from ...services import clocks
from ..base import ClockBackend


class OrgClockBackend(ClockBackend):
    """ClockBackend backed by an org-mode clocks file."""

    def __init__(self, clocks_file: Path) -> None:
        self._clocks_file = clocks_file

    @property
    def data_file(self) -> Path:
        return self._clocks_file

    def list_entries(
        self,
        period: str = "today",
        customer: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        task_id: str | None = None,
        contract: str | None = None,
    ) -> list[dict]:
        return clocks.list_entries(
            clocks_file=self._clocks_file,
            period=period,
            customer=customer,
            from_date=from_date,
            to_date=to_date,
            task_id=task_id,
            contract=contract,
        )

    def get_active(self) -> dict | None:
        return clocks.get_active_timer(clocks_file=self._clocks_file)

    def get_summary(self, period: str = "month") -> list[dict]:
        return clocks.get_summary(
            clocks_file=self._clocks_file,
            period=period,
        )

    def start(
        self,
        customer: str,
        description: str,
        task_id: str | None = None,
        contract: str | None = None,
    ) -> dict:
        return clocks.start_timer(
            clocks_file=self._clocks_file,
            customer=customer,
            description=description,
            task_id=task_id,
            contract=contract,
        )

    def stop(self) -> dict:
        return clocks.stop_timer(clocks_file=self._clocks_file)

    def quick_book(
        self,
        duration_str: str,
        customer: str,
        description: str,
        task_id: str | None = None,
        contract: str | None = None,
        target_date=None,
        notes: str | None = None,
    ) -> dict:
        return clocks.quick_book(
            clocks_file=self._clocks_file,
            duration_str=duration_str,
            customer=customer,
            description=description,
            task_id=task_id,
            contract=contract,
            target_date=target_date,
            notes=notes,
        )

    def update_entry(
        self,
        start_iso: str,
        customer: str | None = None,
        description: str | None = None,
        hours: float | None = None,
        new_date=None,
        start_time: str | None = None,
        task_id: str | None = None,
        invoiced: bool | None = None,
        notes: str | None = None,
        contract: str | None = None,
    ) -> dict | None:
        return clocks.update_clock_entry(
            clocks_file=self._clocks_file,
            start_iso=start_iso,
            customer=customer,
            description=description,
            hours=hours,
            new_date=new_date,
            start_time=start_time,
            task_id=task_id,
            invoiced=invoiced,
            notes=notes,
            contract=contract,
        )

    def delete_entry(self, start_iso: str) -> bool:
        return clocks.delete_clock_entry(
            clocks_file=self._clocks_file,
            start_iso=start_iso,
        )
