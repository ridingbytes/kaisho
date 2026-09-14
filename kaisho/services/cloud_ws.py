"""Cloud WebSocket client.

Connects to the kaisho-cloud WebSocket for real-time
event notifications. When the cloud pushes events like
``timer:started`` or ``entries:changed``, the local app
reacts immediately instead of waiting for the next
sync cycle.

The client runs in a background daemon thread and
reconnects automatically on disconnect with exponential
backoff and jitter.
"""

import json
import logging
import random
import threading
from typing import Any, Callable

log = logging.getLogger(__name__)

_MIN_DELAY = 2
_MAX_DELAY = 60

EventHandler = Callable[[str, dict[str, Any]], None]


def _jittered_delay(base: float) -> float:
    """Add +/- 20% jitter to prevent thundering herd."""
    return base * (0.8 + 0.4 * random.random())


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
                # Only a session the server confirmed earns
                # the reset. _connect returning is not that:
                # an API key the server rejects gets a clean
                # TCP connection, a clean send, and an
                # immediate close, so this used to reset the
                # delay on every rejection and retry every
                # two seconds forever. Measured against a
                # server that always refuses: 6 attempts in
                # 12 seconds, the gaps never growing.
                if self._connect():
                    delay = _MIN_DELAY
            except (OSError, ValueError) as exc:
                log.warning("Cloud WS error: %s", exc)
            except Exception:  # noqa: BLE001
                log.warning(
                    "Cloud WS unexpected error",
                    exc_info=True,
                )
            if self._stop.wait(_jittered_delay(delay)):
                break
            delay = min(delay * 2, _MAX_DELAY)

    def _connect(self) -> bool:
        """Single WebSocket connection session.

        Authenticates via a first-message auth handshake
        instead of passing the API key in the query
        string (which leaks into proxy/server logs).

        :returns: True if the server confirmed the session.
            A rejected key looks exactly like a successful
            connect up to the point the server hangs up, so
            the caller needs to be told which happened.
        """
        try:
            import websocket
        except ImportError:
            log.warning(
                "websocket-client not installed, "
                "cloud WS disabled",
            )
            self._stop.set()
            return False

        ws_url = self._url.replace(
            "https://", "wss://",
        ).replace(
            "http://", "ws://",
        )
        ws_url += "/ws"

        ws = websocket.WebSocket()
        ws.settimeout(90)
        try:
            ws.connect(ws_url)
            # Authenticate via first message instead of
            # query string to keep the key out of logs.
            ws.send(json.dumps({
                "type": "auth",
                "api_key": self._api_key,
            }))
            return self._receive_loop(ws)
        finally:
            try:
                ws.close()
            except OSError:
                pass

    def _receive_loop(self, ws) -> bool:
        """Process messages until disconnect.

        :returns: True if the server ever confirmed the
            session with its ``connected`` event.
        """
        import websocket as ws_module

        confirmed = False
        while not self._stop.is_set():
            try:
                raw = ws.recv()
            except ws_module.WebSocketTimeoutException:
                break
            except (
                ws_module
                .WebSocketConnectionClosedException
            ):
                break

            if not raw:
                break

            # Parse JSON separately so a malformed
            # message doesn't kill the connection.
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                log.warning(
                    "Malformed WS message: %s",
                    raw[:100],
                )
                continue

            event = msg.get("event", "")
            data = msg.get("data", {})
            if event == "connected" and not confirmed:
                confirmed = True
                log.info("Cloud WS connected")
            try:
                self._on_event(event, data)
            except Exception:  # noqa: BLE001
                log.exception(
                    "Event handler error for %s",
                    event,
                )
        if confirmed:
            log.info("Cloud WS disconnected")
        return confirmed


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
