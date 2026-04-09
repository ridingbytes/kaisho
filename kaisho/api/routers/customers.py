from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ...backends import get_backend

router = APIRouter(prefix="/api/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    name: str
    status: str = "active"
    type: str = ""
    color: str = ""
    budget: float = 0
    repo: str | None = None
    tags: list[str] = []


@router.post("/", status_code=201)
def create_customer(body: CustomerCreate):
    try:
        return get_backend().customers.add_customer(
            name=body.name,
            status=body.status,
            customer_type=body.type,
            budget=body.budget,
            color=body.color,
            repo=body.repo,
            tags=body.tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


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


@router.delete("/{name}", status_code=204)
def delete_customer(name: str):
    ok = get_backend().customers.delete_customer(name)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Customer not found"
        )


class ContractCreate(BaseModel):
    name: str
    budget: float
    start_date: str
    notes: str = ""
    billable: bool = True


class ContractUpdate(BaseModel):
    name: str | None = None
    budget: float | None = None
    start_date: str | None = None
    end_date: str | None = None
    notes: str | None = None
    used_offset: float | None = None
    billable: bool | None = None


@router.get("/{name}/contracts")
def list_contracts(name: str):
    try:
        return get_backend().customers.list_contracts(name)
    except ValueError:
        raise HTTPException(
            status_code=404, detail="Customer not found"
        )


@router.post("/{name}/contracts", status_code=201)
def add_contract(name: str, body: ContractCreate):
    try:
        return get_backend().customers.add_contract(
            name, body.name, body.budget,
            body.start_date, body.notes,
            body.billable,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/{name}/contracts/{contract_name:path}")
def update_contract(
    name: str, contract_name: str, body: ContractUpdate
):
    updates = body.model_dump(exclude_none=True)
    contract = get_backend().customers.update_contract(
        name, contract_name, updates
    )
    if contract is None:
        raise HTTPException(
            status_code=404, detail="Contract not found"
        )
    return contract


@router.delete("/{name}/contracts/{contract_name:path}", status_code=204)
def delete_contract(name: str, contract_name: str):
    ok = get_backend().customers.delete_contract(name, contract_name)
    if not ok:
        raise HTTPException(
            status_code=404, detail="Contract not found"
        )
