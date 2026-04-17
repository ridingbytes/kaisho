"""Cloud WebSocket client.

Connects to the kaisho-cloud WebSocket for real-time
event notifications. When the cloud pushes events like
``timer:started`` or ``entries:changed``, the local app
reacts immediately instead of waiting for the next
sync cycle.

The client runs in a background daemon thread and
reconnects automatically on disconnect.
"""

import json
import logging
import threading
import time
from typing import Any, Callable

log = logging.getLogger(__name__)

# Reconnect with exponential backoff
_MIN_DELAY = 2
_MAX_DELAY = 60

EventHandler = Callable[[str, dict[str, Any]], None]


class CloudWsClient:
    """Background WebSocket client to the cloud server.

    :param url: Cloud server URL (http/https).
    :param api_key: API key for auth.
    :param on_event: Callback for incoming events.
    """

    def __init__(
        self,
        url: str,
        api_key: str,
        on_event: EventHandler,
    ) -> None:
        self._url = url
        self._api_key = api_key
        self._on_event = on_event
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        """Start the background listener thread."""
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name="cloud-ws",
        )
        self._thread.start()
        log.info("Cloud WS client started")

    def stop(self) -> None:
        """Stop the background listener."""
        self._stop.set()
        log.info("Cloud WS client stopped")

    def _run(self) -> None:
        """Connect loop with exponential backoff."""
        delay = _MIN_DELAY
        while not self._stop.is_set():
            try:
                self._connect()
                delay = _MIN_DELAY
            except Exception as exc:
                log.warning(
                    "Cloud WS error: %s", exc,
                )
            if self._stop.wait(delay):
                break
            delay = min(delay * 2, _MAX_DELAY)

    def _connect(self) -> None:
        """Single WebSocket connection session."""
        try:
            import websocket
        except ImportError:
            log.warning(
                "websocket-client not installed, "
                "cloud WS disabled",
            )
            self._stop.set()
            return

        ws_url = self._url.replace(
            "https://", "wss://",
        ).replace(
            "http://", "ws://",
        )
        ws_url += f"/ws?api_key={self._api_key}"

        ws = websocket.WebSocket()
        ws.settimeout(90)  # pong timeout
        try:
            ws.connect(ws_url)
            log.info("Cloud WS connected")
            while not self._stop.is_set():
                try:
                    raw = ws.recv()
                    if not raw:
                        break
                    msg = json.loads(raw)
                    event = msg.get("event", "")
                    data = msg.get("data", {})
                    try:
                        self._on_event(event, data)
                    except Exception:
                        log.exception(
                            "Cloud WS event handler "
                            "error for %s",
                            event,
                        )
                except websocket.WebSocketTimeoutException:
                    # No message in 90s — connection
                    # likely dead, reconnect
                    break
                except (
                    websocket.WebSocketConnectionClosedException,
                ):
                    break
        finally:
            try:
                ws.close()
            except Exception:
                pass
            log.info("Cloud WS disconnected")


# Singleton instance, managed by the scheduler
_client: CloudWsClient | None = None


def start_cloud_ws(
    url: str,
    api_key: str,
    on_event: EventHandler,
) -> None:
    """Start the global cloud WS client."""
    global _client
    stop_cloud_ws()
    _client = CloudWsClient(url, api_key, on_event)
    _client.start()


def stop_cloud_ws() -> None:
    """Stop the global cloud WS client."""
    global _client
    if _client:
        _client.stop()
        _client = None
