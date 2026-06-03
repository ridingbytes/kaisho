"""Tests for the HTTP transport on the MCP server.

Covers the token module and the bearer-auth middleware that
gates the mounted ``/mcp`` endpoint when kai serve is up.
The end-to-end transport (uvicorn + FastAPI lifespan +
FastMCP session manager) is exercised manually; here we keep
the surface unit-shaped so the tests stay fast.
"""
import asyncio
import os
import stat
from pathlib import Path

import pytest

from kaisho.mcp.server import BearerAuthMiddleware
from kaisho.mcp.token import (
    load_or_create_token,
    token_path,
    verify_token,
)


def test_token_created_on_first_read(tmp_path):
    token = load_or_create_token(tmp_path)
    assert token
    assert len(token) > 20
    assert token_path(tmp_path).exists()


def test_token_is_stable_across_reads(tmp_path):
    first = load_or_create_token(tmp_path)
    second = load_or_create_token(tmp_path)
    assert first == second


def test_token_file_is_user_only(tmp_path):
    load_or_create_token(tmp_path)
    if os.name == "nt":
        pytest.skip("POSIX perms not enforced on Windows")
    mode = token_path(tmp_path).stat().st_mode
    assert stat.S_IMODE(mode) == 0o600


def test_token_rotation_after_delete(tmp_path):
    first = load_or_create_token(tmp_path)
    token_path(tmp_path).unlink()
    second = load_or_create_token(tmp_path)
    assert first != second


def test_verify_rejects_empty_string(tmp_path):
    load_or_create_token(tmp_path)
    assert verify_token(tmp_path, "") is False


def test_verify_rejects_missing_file(tmp_path):
    assert verify_token(tmp_path, "anything") is False


def test_verify_accepts_correct_token(tmp_path):
    token = load_or_create_token(tmp_path)
    assert verify_token(tmp_path, token) is True


def test_verify_rejects_wrong_token(tmp_path):
    load_or_create_token(tmp_path)
    assert verify_token(tmp_path, "not-the-token") is False


# -- Middleware behaviour ---------------------------------

class _Recorder:
    """Capture ASGI send events so the test can assert on
    the response without spinning up a real server."""

    def __init__(self):
        self.events = []

    async def __call__(self, message):
        self.events.append(message)


async def _inner_app(scope, receive, send):
    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [],
    })
    await send({
        "type": "http.response.body",
        "body": b"ok",
    })


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _scope(headers=None):
    return {
        "type": "http",
        "method": "POST",
        "path": "/mcp/",
        "headers": headers or [],
    }


def test_middleware_passes_through_with_valid_token(tmp_path):
    token = load_or_create_token(tmp_path)
    middleware = BearerAuthMiddleware(_inner_app, tmp_path)
    recorder = _Recorder()
    auth = f"Bearer {token}".encode("latin-1")
    scope = _scope([(b"authorization", auth)])

    async def empty_receive():
        return {"type": "http.disconnect"}

    asyncio.run(middleware(scope, empty_receive, recorder))
    statuses = [
        e for e in recorder.events
        if e["type"] == "http.response.start"
    ]
    assert statuses and statuses[0]["status"] == 200


def test_middleware_rejects_missing_header(tmp_path):
    load_or_create_token(tmp_path)
    middleware = BearerAuthMiddleware(_inner_app, tmp_path)
    recorder = _Recorder()

    async def empty_receive():
        return {"type": "http.disconnect"}

    asyncio.run(middleware(_scope(), empty_receive, recorder))
    statuses = [
        e for e in recorder.events
        if e["type"] == "http.response.start"
    ]
    assert statuses and statuses[0]["status"] == 401


def test_middleware_rejects_wrong_token(tmp_path):
    load_or_create_token(tmp_path)
    middleware = BearerAuthMiddleware(_inner_app, tmp_path)
    recorder = _Recorder()
    auth = b"Bearer not-the-real-token"
    scope = _scope([(b"authorization", auth)])

    async def empty_receive():
        return {"type": "http.disconnect"}

    asyncio.run(middleware(scope, empty_receive, recorder))
    statuses = [
        e for e in recorder.events
        if e["type"] == "http.response.start"
    ]
    assert statuses and statuses[0]["status"] == 401


def test_middleware_passes_through_non_http_scopes(tmp_path):
    """Lifespan and websocket scopes must not be auth-gated;
    the middleware should hand them straight to the inner
    app so FastMCP's own lifespan still runs.
    """
    load_or_create_token(tmp_path)
    middleware = BearerAuthMiddleware(_inner_app, tmp_path)
    recorder = _Recorder()
    seen = {"called": False}

    async def inner(scope, receive, send):
        seen["called"] = True

    middleware.app = inner
    asyncio.run(middleware(
        {"type": "lifespan"}, lambda: None, recorder,
    ))
    assert seen["called"] is True
