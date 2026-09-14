"""The URL allowlist has to hold across redirects.

``urlopen`` follows them, so checking the domain of the URL
we were handed says nothing about the domain we end up
reading. An allowed host answering 302 with a Location of
its choosing could otherwise hand the model anything this
machine can reach, and whatever comes back is written into
the user's inbox.
"""
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from kaisho.cron import executor as executor_svc
from kaisho.cron import tools as tools_svc


class _Secret(BaseHTTPRequestHandler):
    hits = 0

    def log_message(self, *args):
        pass

    def do_GET(self):
        type(self).hits += 1
        body = b"internal-only"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _serve(handler):
    server = HTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(
        target=server.serve_forever, daemon=True,
    ).start()
    return server, server.server_address[1]


@pytest.fixture
def hosts(monkeypatch):
    """An allowed host that redirects to one nobody allowed.

    Both are this machine; they differ by hostname, which is
    what the allowlist is keyed on.
    """
    _Secret.hits = 0
    secret, secret_port = _serve(_Secret)

    class _Redirect(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            self.send_response(302)
            self.send_header(
                "Location",
                f"http://localhost:{secret_port}/x",
            )
            self.end_headers()

    redirect, redirect_port = _serve(_Redirect)
    monkeypatch.setattr(
        tools_svc, "_is_domain_allowed",
        lambda domain: domain == "127.0.0.1",
    )
    yield f"http://127.0.0.1:{redirect_port}/start"
    secret.shutdown()
    redirect.shutdown()


def test_prefetch_does_not_follow_off_allowlist(hosts):
    out = executor_svc._prefetch_urls([hosts])
    assert "internal-only" not in out
    assert _Secret.hits == 0


def test_fetch_url_does_not_follow_off_allowlist(hosts):
    out = tools_svc._fetch_url(hosts)
    assert "internal-only" not in str(out)
    assert _Secret.hits == 0
    assert "error" in out


def test_prefetch_refuses_non_http_schemes():
    out = executor_svc._prefetch_urls(["file:///etc/hosts"])
    assert "BLOCKED" in out
    # The old message blamed the allowlist for a URL that
    # has no host to check, which sent the reader to
    # Settings to add "" to a list.
    assert "http" in out


def test_a_redirect_that_stays_allowed_still_works(
    monkeypatch,
):
    """The guard refuses a hop off the allowlist, not every
    hop."""
    class _Target(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            body = b"fine"
            self.send_response(200)
            self.send_header(
                "Content-Length", str(len(body)),
            )
            self.end_headers()
            self.wfile.write(body)

    target, target_port = _serve(_Target)

    class _Redirect(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            self.send_response(302)
            self.send_header(
                "Location",
                f"http://127.0.0.1:{target_port}/y",
            )
            self.end_headers()

    redirect, redirect_port = _serve(_Redirect)
    monkeypatch.setattr(
        tools_svc, "_is_domain_allowed",
        lambda domain: domain == "127.0.0.1",
    )
    out = executor_svc._prefetch_urls(
        [f"http://127.0.0.1:{redirect_port}/start"]
    )
    assert "fine" in out
    target.shutdown()
    redirect.shutdown()
