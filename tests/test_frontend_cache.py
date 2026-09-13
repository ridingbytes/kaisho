"""Cache headers on the served frontend.

The desktop app is a WebView pointed at a URL that never
changes between versions. Without an explicit Cache-Control
on index.html, WebKit caches it heuristically off
Last-Modified and keeps serving the previous build's
index.html after an update. That file names the previous
build's fingerprinted assets, which are still in the same
cache, so the app renders the entire old frontend against a
new backend. v2.9.0 shipped that way.

These tests pin the policy: fingerprinted assets immutable,
index.html never stored, stable names revalidated.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    """Keep the app import off the real profile.

    Importing kaisho.api.app resolves the config and caches
    it process-wide. Without this, these tests would load
    the developer's own settings and leave them cached for
    whatever test runs next.
    """
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path / ".kaisho"))
    monkeypatch.setenv("PROFILE", "default")

    from kaisho.config import reset_config
    from kaisho.backends import get_backend
    reset_config()
    get_backend.cache_clear()

    yield

    reset_config()
    get_backend.cache_clear()


@pytest.fixture
def dist(tmp_path):
    """A minimal build tree shaped like Vite's output."""
    root = tmp_path / "dist"
    assets = root / "assets"
    assets.mkdir(parents=True)
    (root / "index.html").write_text(
        '<!doctype html><script src="/assets/main-abc123.js">'
        "</script>",
        encoding="utf-8",
    )
    (assets / "main-abc123.js").write_text(
        "console.log(1)", encoding="utf-8",
    )
    (root / "kaisho-logo.svg").write_text(
        "<svg/>", encoding="utf-8",
    )
    (root / "manifest.json").write_text(
        "{}", encoding="utf-8",
    )
    return root


@pytest.fixture
def client(dist, monkeypatch):
    """An app with the frontend mounted from the fixture."""
    monkeypatch.setenv("SERVE_FRONTEND", "true")
    from kaisho.api.app import _mount_frontend
    app = FastAPI()
    _mount_frontend(target=app, dist=dist)
    return TestClient(app)


def test_index_is_never_cached(client):
    """A stale index.html pins the whole frontend."""
    response = client.get("/")
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]


def test_unknown_path_falls_back_uncached(client):
    """The SPA fallback serves index.html; same rule."""
    response = client.get("/dashboard")
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]


def test_fingerprinted_assets_are_immutable(client):
    """The name carries a content hash, so it is safe."""
    response = client.get("/assets/main-abc123.js")
    assert response.status_code == 200
    cache = response.headers["cache-control"]
    assert "immutable" in cache
    assert "max-age=31536000" in cache


def test_stable_names_revalidate(client):
    """Logos keep their name across builds, so caching
    them blind would pin an old one."""
    response = client.get("/kaisho-logo.svg")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


def test_other_dist_files_revalidate(client):
    """Anything else in dist is served, not fingerprinted,
    and must revalidate rather than be stored."""
    response = client.get("/manifest.json")
    assert response.status_code == 200
    assert "no-cache" in response.headers["cache-control"]


def test_api_paths_are_not_swallowed(client):
    """The catch-all must not answer for /api."""
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404


def test_not_mounted_without_the_env_var(dist, monkeypatch):
    """Dev runs behind Vite and must serve nothing."""
    monkeypatch.delenv("SERVE_FRONTEND", raising=False)
    from kaisho.api.app import _mount_frontend
    app = FastAPI()
    _mount_frontend(target=app, dist=dist)
    assert TestClient(app).get("/").status_code == 404
