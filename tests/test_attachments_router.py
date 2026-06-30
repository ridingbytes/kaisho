"""Tests for ``/api/attachments``.

The router writes files into the active profile's dir and
serves them back. We stub ``get_config`` to point at a
tmp_path so the test never touches the developer's real
``~/.kaisho``.
"""
from io import BytesIO

from fastapi import FastAPI
from fastapi.testclient import TestClient

import kaisho.api.routers.attachments as att


def _client(monkeypatch, tmp_path):
    class FakeCfg:
        PROFILE_DIR = tmp_path / "profile"

    monkeypatch.setattr(
        att, "get_config", lambda: FakeCfg(),
    )
    app = FastAPI()
    app.include_router(att.router)
    return TestClient(app), FakeCfg.PROFILE_DIR


def test_upload_writes_file_and_returns_url(
    monkeypatch, tmp_path,
):
    """Happy path: file lands on disk in the task bucket
    and the response carries a URL we can fetch back."""
    client, profile = _client(monkeypatch, tmp_path)
    resp = client.post(
        "/api/attachments",
        files={
            "file": ("note.png", BytesIO(b"PNG"), "image/png"),
        },
        data={"task_id": "abc123"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "note.png"
    assert body["size"] == 3
    assert body["url"].startswith(
        "/api/attachments/abc123/",
    )

    written = list(
        (profile / "attachments" / "abc123").iterdir(),
    )
    assert len(written) == 1
    assert written[0].read_bytes() == b"PNG"


def test_serve_round_trip(monkeypatch, tmp_path):
    """After upload, GET on the returned URL returns the
    same bytes with a sensible content-type."""
    client, _ = _client(monkeypatch, tmp_path)
    up = client.post(
        "/api/attachments",
        files={
            "file": (
                "a.png", BytesIO(b"hello"), "image/png",
            ),
        },
        data={"task_id": "t1"},
    ).json()
    got = client.get(up["url"])
    assert got.status_code == 200
    assert got.content == b"hello"
    assert got.headers["content-type"].startswith(
        "image/",
    )


def test_unsafe_task_id_is_sanitised(
    monkeypatch, tmp_path,
):
    """A task id with traversal characters must not be
    able to escape the attachments root."""
    client, profile = _client(monkeypatch, tmp_path)
    resp = client.post(
        "/api/attachments",
        files={
            "file": ("x.txt", BytesIO(b"x"), "text/plain"),
        },
        data={"task_id": "../../evil"},
    )
    assert resp.status_code == 200
    # bucket sanitised to ``-evil`` (or similar) — must be
    # inside the attachments root, not above it.
    root = (profile / "attachments").resolve()
    written = list(root.rglob("*.txt"))
    assert len(written) == 1
    assert str(written[0].resolve()).startswith(str(root))


def test_missing_task_id_buckets_to_misc(
    monkeypatch, tmp_path,
):
    """An empty task_id falls back to the ``_misc`` bucket
    so orphan attachments still have a home."""
    client, profile = _client(monkeypatch, tmp_path)
    resp = client.post(
        "/api/attachments",
        files={
            "file": ("o.txt", BytesIO(b"o"), "text/plain"),
        },
        data={"task_id": ""},
    ).json()
    assert resp["url"].startswith(
        "/api/attachments/_misc/",
    )
    assert (profile / "attachments" / "_misc").is_dir()


def test_size_limit_enforced(monkeypatch, tmp_path):
    """Files over the limit are refused with 413 and no
    partial file is left on disk."""
    monkeypatch.setattr(att, "MAX_BYTES", 8)
    client, profile = _client(monkeypatch, tmp_path)
    resp = client.post(
        "/api/attachments",
        files={
            "file": (
                "big.bin",
                BytesIO(b"x" * 100),
                "application/octet-stream",
            ),
        },
        data={"task_id": "t"},
    )
    assert resp.status_code == 413
    bucket = profile / "attachments" / "t"
    assert (
        not bucket.exists()
        or list(bucket.iterdir()) == []
    )


def test_bucket_file_count_cap(monkeypatch, tmp_path):
    """Once a bucket hits the file-count ceiling, further
    uploads are refused with 413."""
    monkeypatch.setattr(att, "MAX_BUCKET_FILES", 2)
    client, _ = _client(monkeypatch, tmp_path)

    def _put(n):
        return client.post(
            "/api/attachments",
            files={
                "file": (
                    f"f{n}.txt",
                    BytesIO(b"x"),
                    "text/plain",
                ),
            },
            data={"task_id": "b"},
        )

    assert _put(1).status_code == 200
    assert _put(2).status_code == 200
    third = _put(3)
    assert third.status_code == 413
    assert "files" in third.json()["detail"]


def test_bucket_total_size_cap(monkeypatch, tmp_path):
    """A bucket's aggregate byte ceiling is enforced even
    when each individual file is under the per-file cap."""
    monkeypatch.setattr(att, "MAX_BUCKET_BYTES", 10)
    client, _ = _client(monkeypatch, tmp_path)

    def _put(n):
        return client.post(
            "/api/attachments",
            files={
                "file": (
                    f"f{n}.bin",
                    BytesIO(b"x" * 6),
                    "application/octet-stream",
                ),
            },
            data={"task_id": "b"},
        )

    assert _put(1).status_code == 200   # 6 bytes
    over = _put(2)                       # would be 12 > 10
    assert over.status_code == 413
    assert "bucket" in over.json()["detail"]


def test_svg_is_forced_to_download(monkeypatch, tmp_path):
    """SVG can carry script; never serve it inline. The
    GET must force download + neutralise the mime so the
    browser cannot execute it same-origin."""
    client, _ = _client(monkeypatch, tmp_path)
    up = client.post(
        "/api/attachments",
        files={
            "file": (
                "x.svg",
                BytesIO(b"<svg xmlns='http://www.w3.org/2000/svg'/>"),
                "image/svg+xml",
            ),
        },
        data={"task_id": "t"},
    ).json()
    got = client.get(up["url"])
    assert got.status_code == 200
    assert got.headers["content-type"] == (
        "application/octet-stream"
    )
    assert "attachment" in got.headers.get(
        "content-disposition", "",
    )
    assert got.headers["x-content-type-options"] == (
        "nosniff"
    )
    assert "sandbox" in got.headers[
        "content-security-policy"
    ]


def test_html_is_forced_to_download(
    monkeypatch, tmp_path,
):
    """HTML uploaded as an attachment must not be served
    as ``text/html`` (would XSS the app same-origin)."""
    client, _ = _client(monkeypatch, tmp_path)
    up = client.post(
        "/api/attachments",
        files={
            "file": (
                "p.html",
                BytesIO(b"<script>alert(1)</script>"),
                "text/html",
            ),
        },
        data={"task_id": "t"},
    ).json()
    got = client.get(up["url"])
    assert got.headers["content-type"] == (
        "application/octet-stream"
    )
    assert "attachment" in got.headers.get(
        "content-disposition", "",
    )


def test_png_served_inline_for_embedding(
    monkeypatch, tmp_path,
):
    """Raster images must stay inline so ``![](url)`` in
    markdown actually shows the picture."""
    client, _ = _client(monkeypatch, tmp_path)
    up = client.post(
        "/api/attachments",
        files={
            "file": (
                "ok.png", BytesIO(b"PNG"), "image/png",
            ),
        },
        data={"task_id": "t"},
    ).json()
    got = client.get(up["url"])
    assert got.headers["content-type"].startswith(
        "image/png",
    )
    assert "attachment" not in got.headers.get(
        "content-disposition", "",
    )


def test_serve_404_for_missing_file(
    monkeypatch, tmp_path,
):
    client, _ = _client(monkeypatch, tmp_path)
    resp = client.get(
        "/api/attachments/_misc/does-not-exist.png",
    )
    assert resp.status_code == 404
