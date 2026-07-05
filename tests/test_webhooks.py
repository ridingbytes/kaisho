"""Tests for outbound webhook subscriptions and delivery.

Phase 2 of `product/WORKFLOW-AUTOMATION.md`. The HTTP
`_post` is stubbed so no real network call is made; the
tests exercise CRUD, masking, signing, the allowlist
egress guard, retry/backoff, and the delivery log.
"""
import hashlib
import hmac
import json

import pytest
import urllib.error

from kaisho.services import events
from kaisho.services import webhooks as wh


@pytest.fixture
def settings_file(tmp_path):
    return tmp_path / "settings.yaml"


def _ping():
    return events.build_event("ping", {"message": "hi"})


# -- CRUD + masking ---------------------------------------

def test_add_and_list_masks_secret(settings_file):
    created = wh.add_webhook(
        settings_file, "https://hooks.example.com/x",
        ["task.moved"], secret="s3cr3t",
    )
    assert created["id"].startswith("wh_")
    assert "secret" not in created
    assert created["secret_set"] is True

    listed = wh.list_webhooks_safe(settings_file)
    assert len(listed) == 1
    assert listed[0]["secret_set"] is True
    assert "secret" not in listed[0]
    # Raw store still holds the secret for signing.
    assert wh.list_webhooks(settings_file)[0]["secret"] == (
        "s3cr3t"
    )


def test_add_approves_domain(settings_file):
    from kaisho.services import settings as settings_svc

    wh.add_webhook(
        settings_file, "https://n8n.example.com/wh", [],
    )
    data = settings_svc.load_settings(settings_file)
    assert "n8n.example.com" in (
        settings_svc.get_url_allowlist(data)
    )


def test_update_ignores_empty_secret(settings_file):
    created = wh.add_webhook(
        settings_file, "https://a.example.com", [],
        secret="keep-me",
    )
    wh.update_webhook(
        settings_file, created["id"],
        {"active": False, "secret": ""},
    )
    raw = wh.list_webhooks(settings_file)[0]
    assert raw["active"] is False
    assert raw["secret"] == "keep-me"  # Not overwritten.


def test_remove_webhook(settings_file):
    created = wh.add_webhook(
        settings_file, "https://a.example.com", [],
    )
    assert wh.remove_webhook(settings_file, created["id"])
    assert wh.list_webhooks(settings_file) == []
    # Second removal reports it was already gone.
    assert not wh.remove_webhook(
        settings_file, created["id"],
    )


# -- Matching ---------------------------------------------

def test_matches_empty_means_all():
    assert wh._matches({"events": []}, "task.moved")
    assert wh._matches({}, "clock.booked")


def test_matches_specific():
    sub = {"events": ["task.moved"]}
    assert wh._matches(sub, "task.moved")
    assert not wh._matches(sub, "task.created")


# -- Delivery: signing & success --------------------------

def test_deliver_signs_and_records(
    settings_file, monkeypatch,
):
    sent = {}

    def fake_post(url, body, headers):
        sent["url"] = url
        sent["body"] = body
        sent["headers"] = headers
        return 200

    monkeypatch.setattr(wh, "_post", fake_post)

    created = wh.add_webhook(
        settings_file, "https://hooks.example.com/x",
        ["ping"], secret="topsecret",
    )
    raw = wh.list_webhooks(settings_file)[0]
    event = _ping()
    record = wh.deliver(settings_file, raw, event)

    assert record["status"] == "success"
    assert record["http_status"] == 200
    # Body is the exact serialized event.
    assert json.loads(sent["body"]) == event
    # Signature matches an independent HMAC.
    expected = "sha256=" + hmac.new(
        b"topsecret", sent["body"], hashlib.sha256,
    ).hexdigest()
    assert sent["headers"]["X-Kaisho-Signature"] == expected
    assert sent["headers"]["X-Kaisho-Event"] == "ping"

    # And it shows up in the delivery log.
    recent = wh.recent_deliveries(created["id"])
    assert recent[0]["status"] == "success"


def test_deliver_blocked_when_domain_not_allowed(
    settings_file, monkeypatch,
):
    called = {"n": 0}
    monkeypatch.setattr(
        wh, "_post",
        lambda *a, **k: called.__setitem__(
            "n", called["n"] + 1,
        ),
    )
    # Hand-built subscription whose domain was never
    # approved (bypasses add_webhook's auto-approve).
    sub = {
        "id": "wh_manual",
        "url": "https://evil.example.com/x",
        "events": [],
        "secret": "",
        "active": True,
    }
    record = wh.deliver(settings_file, sub, _ping())
    assert record["status"] == "blocked"
    assert called["n"] == 0  # Never hit the network.


def test_deliver_retries_then_fails(
    settings_file, monkeypatch,
):
    attempts = {"n": 0}

    def boom(url, body, headers):
        attempts["n"] += 1
        raise urllib.error.URLError("refused")

    monkeypatch.setattr(wh, "_post", boom)
    monkeypatch.setattr(wh.time, "sleep", lambda s: None)

    wh.add_webhook(
        settings_file, "https://hooks.example.com/x", [],
    )
    raw = wh.list_webhooks(settings_file)[0]
    record = wh.deliver(settings_file, raw, _ping())

    assert record["status"] == "failed"
    assert record["attempts"] == wh._MAX_ATTEMPTS
    assert attempts["n"] == wh._MAX_ATTEMPTS
    assert "refused" in record["error"]


def test_send_test_delivers_ping(
    settings_file, monkeypatch,
):
    monkeypatch.setattr(
        wh, "_post", lambda url, body, headers: 204,
    )
    created = wh.add_webhook(
        settings_file, "https://hooks.example.com/x", [],
    )
    result = wh.send_test(
        settings_file, created["id"],
    )
    assert result["status"] == "success"
    assert result["event"] == "ping"


def test_send_test_unknown_id(settings_file):
    assert wh.send_test(settings_file, "wh_nope") is None
