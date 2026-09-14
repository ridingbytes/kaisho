"""Reconnect backoff for the cloud WebSocket client.

An API key the server rejects looks, up to the moment the
server hangs up, exactly like a good one: the TCP
connection is made, the auth frame is sent, and the socket
closes. Only the server's ``connected`` event tells the two
apart, and the backoff has to turn on that distinction or
a bad key becomes a reconnect storm.
"""
import time

import pytest

from kaisho.services import cloud_ws
from kaisho.services.cloud_ws import CloudWsClient


@pytest.fixture(autouse=True)
def fast_backoff(monkeypatch):
    """Shrink the delays so a test can watch several."""
    monkeypatch.setattr(cloud_ws, "_MIN_DELAY", 0.05)
    monkeypatch.setattr(cloud_ws, "_MAX_DELAY", 1.0)
    # No jitter: the assertions are about growth, and
    # +/-20% of a 50ms delay is noise either way.
    monkeypatch.setattr(
        cloud_ws, "_jittered_delay", lambda base: base,
    )


class _Recording(CloudWsClient):
    def __init__(self, confirmed):
        super().__init__(
            "https://cloud.example", "k", lambda e, d: None,
        )
        self._confirmed = confirmed
        self.attempts = []

    def _connect(self):
        self.attempts.append(time.monotonic())
        return self._confirmed


def _gaps(times):
    return [b - a for a, b in zip(times, times[1:])]


def _run_for(client, seconds):
    client.start()
    time.sleep(seconds)
    client.stop()
    time.sleep(0.1)


def test_a_rejected_session_backs_off():
    """The delay has to grow.

    Against the old code it did not: _connect returning was
    treated as success, so a rejected key retried every
    _MIN_DELAY seconds forever.
    """
    client = _Recording(confirmed=False)
    _run_for(client, 1.2)

    gaps = _gaps(client.attempts)
    assert len(gaps) >= 3, client.attempts
    # Each wait at least as long as the one before, and the
    # last clearly longer than the first.
    assert gaps[-1] > gaps[0] * 1.5, gaps


def test_a_confirmed_session_reconnects_promptly():
    """The guard must not punish a working connection that
    simply ended."""
    client = _Recording(confirmed=True)
    _run_for(client, 0.6)

    gaps = _gaps(client.attempts)
    assert len(gaps) >= 3, client.attempts
    assert max(gaps) < 0.2, gaps


def test_receive_loop_reports_the_connected_event():
    """The event is what confirmation means."""
    seen = []
    client = CloudWsClient(
        "https://cloud.example", "k",
        lambda event, data: seen.append(event),
    )
    assert client._receive_loop(
        _FakeSocket(['{"event":"connected","data":{}}'])
    ) is True
    assert seen == ["connected"]


def test_receive_loop_without_the_event_is_not_confirmed():
    """A server that sends data but never confirms, or one
    that closes straight away, is not a good session."""
    client = CloudWsClient(
        "https://cloud.example", "k", lambda e, d: None,
    )
    assert client._receive_loop(_FakeSocket([])) is False
    assert client._receive_loop(
        _FakeSocket(['{"event":"tasks:changed","data":{}}'])
    ) is False


def test_a_malformed_frame_does_not_end_the_session():
    seen = []
    client = CloudWsClient(
        "https://cloud.example", "k",
        lambda event, data: seen.append(event),
    )
    assert client._receive_loop(_FakeSocket([
        "not json",
        '{"event":"connected","data":{}}',
    ])) is True
    assert seen == ["connected"]


class _FakeSocket:
    """Yields the given frames, then closes."""

    def __init__(self, frames):
        self._frames = list(frames)

    def recv(self):
        if self._frames:
            return self._frames.pop(0)
        return ""

    def close(self):
        pass
