from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..ws.manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive; clients send nothing
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
