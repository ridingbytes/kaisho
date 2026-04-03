from fastapi import APIRouter, HTTPException

from ...config import get_config
from ...services import customers as customer_svc

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("/")
def list_customers(include_inactive: bool = False):
    cfg = get_config()
    return customer_svc.list_customers(
        kunden_file=cfg.KUNDEN_FILE,
        include_inactive=include_inactive,
    )


@router.get("/{name}")
def get_customer(name: str):
    cfg = get_config()
    c = customer_svc.get_customer(
        kunden_file=cfg.KUNDEN_FILE, name=name
    )
    if c is None:
        raise HTTPException(
            status_code=404, detail="Customer not found"
        )
    return c
