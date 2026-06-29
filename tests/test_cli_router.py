"""Tests for the ``/api/cli/run`` command-bar endpoint.

The endpoint is a power-user escape hatch in the command
bar; it must refuse destructive verbs (which carry no UI
confirmation step) and the long-running / server-
repointing top-level commands.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

import kaisho.api.routers.cli as cli_router


def _client():
    app = FastAPI()
    app.include_router(cli_router.router)
    return TestClient(app)


def _run(client, command):
    return client.post(
        "/api/cli/run", json={"command": command},
    ).json()


def test_blocks_destructive_verb_in_any_group():
    client = _client()
    for cmd in (
        "task delete abc123",
        "customer remove Acme",
        "backup prune",
        "kai note rm n1",
    ):
        res = _run(client, cmd)
        assert res["exit_code"] == 1, cmd
        assert "Destructive" in res["error"], cmd


def test_blocks_blocked_toplevel():
    client = _client()
    for cmd in ("serve", "profile list", "config get x"):
        res = _run(client, cmd)
        assert res["exit_code"] == 1, cmd
        assert "not allowed" in res["error"], cmd


def test_allows_safe_read_command():
    client = _client()
    res = _run(client, "--help")
    assert res["exit_code"] == 0
    assert res["output"]


def test_empty_command_is_rejected():
    client = _client()
    res = _run(client, "   ")
    assert res["exit_code"] == 1
