"""Webhook subscription settings API.

CRUD for outbound webhook subscriptions plus a delivery
log and a test-fire endpoint. See
`kaisho/services/webhooks.py` and
`product/WORKFLOW-AUTOMATION.md`.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import events
from ...services import webhooks as webhooks_svc

router = APIRouter(
    prefix="/api/settings/webhooks", tags=["settings"],
)


class WebhookCreate(BaseModel):
    url: str
    events: list[str] = []
    secret: str = ""
    active: bool = True


class WebhookUpdate(BaseModel):
    url: str | None = None
    events: list[str] | None = None
    secret: str | None = None
    active: bool | None = None


@router.get("")
def list_webhooks():
    """List subscriptions (secrets masked)."""
    cfg = get_config()
    return {
        "webhooks": webhooks_svc.list_webhooks_safe(
            cfg.SETTINGS_FILE,
        ),
        "events": events.ALL_EVENTS,
    }


@router.post("")
def create_webhook(body: WebhookCreate):
    """Create a subscription."""
    cfg = get_config()
    return webhooks_svc.add_webhook(
        cfg.SETTINGS_FILE, body.url, body.events,
        secret=body.secret, active=body.active,
    )


@router.patch("/{webhook_id}")
def update_webhook(webhook_id: str, body: WebhookUpdate):
    """Update a subscription. Empty secret is ignored."""
    cfg = get_config()
    updated = webhooks_svc.update_webhook(
        cfg.SETTINGS_FILE, webhook_id,
        body.model_dump(exclude_none=True),
    )
    if updated is None:
        raise HTTPException(
            status_code=404, detail="Webhook not found",
        )
    return updated


@router.delete("/{webhook_id}")
def delete_webhook(webhook_id: str):
    """Delete a subscription."""
    cfg = get_config()
    if not webhooks_svc.remove_webhook(
        cfg.SETTINGS_FILE, webhook_id,
    ):
        raise HTTPException(
            status_code=404, detail="Webhook not found",
        )
    return {"ok": True}


@router.post("/{webhook_id}/test")
def test_webhook(webhook_id: str):
    """Fire a synthetic `ping` event at one subscription."""
    cfg = get_config()
    result = webhooks_svc.send_test(
        cfg.SETTINGS_FILE, webhook_id,
    )
    if result is None:
        raise HTTPException(
            status_code=404, detail="Webhook not found",
        )
    return result


@router.get("/deliveries")
def list_deliveries(subscription_id: str | None = None):
    """Return recent delivery records, newest first."""
    return {
        "deliveries": webhooks_svc.recent_deliveries(
            subscription_id,
        ),
    }
