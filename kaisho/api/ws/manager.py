"""WebSocket connection manager for the local kaisho app.

Manages connected frontend clients and provides both
async and sync broadcast functions.
"""

import asyncio
import json

from fastapi import WebSocket


class ConnectionManager:
    """Track connected WebSocket clients and broadcast
    messages to all of them."""

    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket):
        try:
            self._connections.remove(ws)
        except ValueError:
            pass  # Already removed (e.g. by broadcast)

    async def broadcast(self, message: dict):
        """Send JSON message to all connected clients."""
        if not self._connections:
            return

        data = json.dumps(message)

        async def _send(ws: WebSocket):
            await ws.send_text(data)

        results = await asyncio.gather(
            *[_send(ws) for ws in self._connections],
            return_exceptions=True,
        )

        dead = [
            ws
            for ws, result in zip(
                self._connections, results,
            )
            if isinstance(result, Exception)
        ]
        for ws in dead:
            try:
                self._connections.remove(ws)
            except ValueError:
                pass


manager = ConnectionManager()

# The uvicorn event loop, captured at startup so
# background threads can schedule async broadcasts.
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Capture the running event loop (called once
    from the FastAPI lifespan)."""
    global _loop
    _loop = loop


def broadcast_sync(message: dict) -> None:
    """Broadcast from a non-async context.

    Schedules the async broadcast on uvicorn's event
    loop. Safe to call from background threads (e.g.
    the scheduler or cloud WS client).
    """
    if _loop is None or _loop.is_closed():
        return
    asyncio.run_coroutine_threadsafe(
        manager.broadcast(message), _loop,
    )
