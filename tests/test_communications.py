"""Tests for the communications service."""
import pytest

from omnicontrol.services.communications import (
    delete_comm,
    get_comm,
    list_comms,
    log_comm,
    search_comms,
)


def test_log_comm_creates_record(db_file):
    record = log_comm(
        db_file,
        subject="Test email",
        direction="in",
        channel="email",
        customer="ACME",
        body="Hello world",
        contact="bob@example.com",
    )
    assert record["id"] > 0
    assert record["subject"] == "Test email"
    assert record["direction"] == "in"
    assert record["channel"] == "email"
    assert record["customer"] == "ACME"
    assert record["body"] == "Hello world"
    assert record["contact"] == "bob@example.com"


def test_log_comm_invalid_direction(db_file):
    with pytest.raises(ValueError, match="direction"):
        log_comm(db_file, "S", direction="fax", channel="email")


def test_log_comm_invalid_channel(db_file):
    with pytest.raises(ValueError, match="channel"):
        log_comm(db_file, "S", direction="in", channel="fax")


def test_list_comms_returns_all(db_file):
    log_comm(db_file, "First", "in", "email")
    log_comm(db_file, "Second", "out", "phone")
    records = list_comms(db_file)
    assert len(records) == 2


def test_list_comms_filter_by_direction(db_file):
    log_comm(db_file, "In", "in", "email")
    log_comm(db_file, "Out", "out", "email")
    inbound = list_comms(db_file, direction="in")
    assert len(inbound) == 1
    assert inbound[0]["direction"] == "in"


def test_list_comms_filter_by_customer(db_file):
    log_comm(db_file, "A", "in", "email", customer="ACME")
    log_comm(db_file, "B", "in", "email", customer="OTHER")
    records = list_comms(db_file, customer="ACME")
    assert len(records) == 1
    assert records[0]["customer"] == "ACME"


def test_get_comm_returns_record(db_file):
    created = log_comm(db_file, "Test", "in", "email")
    fetched = get_comm(db_file, created["id"])
    assert fetched is not None
    assert fetched["id"] == created["id"]


def test_get_comm_missing_returns_none(db_file):
    assert get_comm(db_file, 999) is None


def test_delete_comm(db_file):
    record = log_comm(db_file, "To delete", "in", "email")
    assert delete_comm(db_file, record["id"]) is True
    assert get_comm(db_file, record["id"]) is None


def test_delete_comm_missing_returns_false(db_file):
    assert delete_comm(db_file, 999) is False


def test_search_comms_finds_subject(db_file):
    log_comm(db_file, "Budget proposal", "out", "email")
    log_comm(db_file, "Meeting notes", "in", "phone")
    results = search_comms(db_file, "budget")
    assert len(results) == 1
    assert "Budget" in results[0]["subject"]


def test_search_comms_finds_body(db_file):
    log_comm(db_file, "Subject", "in", "email", body="secret keyword here")
    log_comm(db_file, "Other", "in", "email", body="nothing special")
    results = search_comms(db_file, "secret keyword")
    assert len(results) == 1
