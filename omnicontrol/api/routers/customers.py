from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ...backends import get_backend

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("/")
def list_customers(include_inactive: bool = False):
    return get_backend().customers.list_customers(
        include_inactive=include_inactive,
    )


@router.get("/{name}")
def get_customer(name: str):
    c = get_backend().customers.get_customer(name)
    if c is None:
        raise HTTPException(
            status_code=404, detail="Customer not found"
        )
    return c


@router.patch("/{name}")
def update_customer(
    name: str,
    updates: dict = Body(...),
):
    c = get_backend().customers.update_customer(name, updates)
    if c is None:
        raise HTTPException(
            status_code=404, detail="Customer not found"
        )
    return c


class TimeEntryCreate(BaseModel):
    description: str
    hours: float
    date: str | None = None


class TimeEntryUpdate(BaseModel):
    description: str | None = None
    hours: float | None = None
    date: str | None = None


@router.get("/{name}/entries")
def list_time_entries(name: str):
    return get_backend().customers.list_time_entries(name)


@router.post("/{name}/entries", status_code=201)
def add_time_entry(name: str, body: TimeEntryCreate):
    try:
        return get_backend().customers.add_time_entry(
            name, body.description, body.hours, body.date
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{name}/entries/{entry_id}")
def update_time_entry(
    name: str, entry_id: str, body: TimeEntryUpdate
):
    entry = get_backend().customers.update_time_entry(
        name, entry_id,
        description=body.description,
        hours=body.hours,
        date=body.date,
    )
    if entry is None:
        raise HTTPException(
            status_code=404, detail="Entry not found"
        )
    return entry


@router.delete("/{name}/entries/{entry_id}", status_code=204)
def delete_time_entry(name: str, entry_id: str):
    ok = get_backend().customers.delete_time_entry(name, entry_id)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Entry not found"
        )
