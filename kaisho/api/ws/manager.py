import asyncio
import json

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket):
        self._connections.remove(ws)

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
            for ws, result in zip(self._connections, results)
            if isinstance(result, Exception)
        ]
        for ws in dead:
            self._connections.remove(ws)


manager = ConnectionManager()
