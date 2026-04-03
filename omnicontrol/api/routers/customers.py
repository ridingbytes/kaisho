from fastapi import APIRouter, Body, HTTPException

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
