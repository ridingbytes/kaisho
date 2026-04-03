from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config, load_settings_yaml
from ...org.parser import parse_org_file
from ...org.writer import write_org_file
from ...services import inbox as inbox_svc
from ...services.inbox import INBOX_KEYWORDS
from ...services.settings import get_state_names

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


class CaptureRequest(BaseModel):
    text: str
    type: str | None = None
    customer: str | None = None


class PromoteRequest(BaseModel):
    customer: str


def _get_keywords() -> set[str]:
    settings = load_settings_yaml()
    names = get_state_names(settings)
    return set(names) if names else {
        "TODO", "NEXT", "IN-PROGRESS", "WAIT", "DONE", "CANCELLED"
    }


@router.get("/")
def list_items():
    cfg = get_config()
    return inbox_svc.list_items(inbox_file=cfg.INBOX_FILE)


@router.post("/capture", status_code=201)
def capture(body: CaptureRequest):
    cfg = get_config()
    return inbox_svc.add_item(
        inbox_file=cfg.INBOX_FILE,
        text=body.text,
        item_type=body.type,
        customer=body.customer,
    )


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str):
    cfg = get_config()
    items = inbox_svc.list_items(inbox_file=cfg.INBOX_FILE)
    idx = int(item_id) - 1
    if idx < 0 or idx >= len(items):
        raise HTTPException(
            status_code=404, detail="Item not found"
        )
    org_file = parse_org_file(cfg.INBOX_FILE, INBOX_KEYWORDS)
    org_file.headings.pop(idx)
    write_org_file(cfg.INBOX_FILE, org_file)


@router.post("/{item_id}/promote", status_code=201)
def promote(item_id: str, body: PromoteRequest):
    cfg = get_config()
    keywords = _get_keywords()
    try:
        return inbox_svc.promote_to_task(
            inbox_file=cfg.INBOX_FILE,
            todos_file=cfg.TODOS_FILE,
            keywords=keywords,
            item_id=item_id,
            customer=body.customer,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
