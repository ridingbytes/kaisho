"""Local file attachments for task descriptions.

Drag-and-drop / paste in the kanban edit form posts the file
bytes here; the response carries a stable URL the frontend
inserts into the markdown body as ``![name](url)``.

Files live under ``{PROFILE_DIR}/attachments/<bucket>/`` so
they ride along with the profile (backup, profile copy,
profile delete). ``bucket`` is the optional ``task_id`` form
field, sanitised to a safe segment — when absent we use
``_misc`` so orphan attachments still have a home.

Local-only: nothing here uploads to kaisho-cloud, and the
mobile PWA will see broken images for desktop attachments.
A follow-up (cloud-backed attachments) is tracked separately.
"""
import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import (
    APIRouter, File, Form, HTTPException, UploadFile,
)
from starlette.responses import FileResponse

from ...config import get_config

router = APIRouter(
    prefix="/api/attachments", tags=["attachments"],
)

MAX_BYTES = 25 * 1024 * 1024  # 25 MiB

_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9._-]+")


def _attachments_root() -> Path:
    return get_config().PROFILE_DIR / "attachments"


def _safe_segment(name: str, fallback: str) -> str:
    """Reduce a string to ``[A-Za-z0-9._-]``; empty after
    sanitisation falls back to the caller-provided token.
    Prevents path traversal and keeps URLs predictable."""
    cleaned = _SAFE_SEGMENT.sub("-", name).strip("-.")
    return cleaned or fallback


def _resolve_within(root: Path, child: Path) -> Path:
    """Resolve ``child`` and refuse if it escapes ``root``.
    The sanitiser above already blocks ``..`` segments, but
    we double-check after resolution because symlinks could
    in principle still cross the boundary."""
    root_r = root.resolve()
    target = child.resolve()
    try:
        target.relative_to(root_r)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="invalid path",
        )
    return target


@router.post("")
async def upload_attachment(
    file: UploadFile = File(...),
    task_id: str = Form(default=""),
):
    """Persist an uploaded file and return its URL.

    :param file: multipart file upload.
    :param task_id: optional task id to bucket the file
        under so attachments live alongside the task they
        belong to.
    :returns: ``{"url": str, "name": str, "size": int}``.
    """
    bucket = _safe_segment(task_id, "_misc")
    safe_name = _safe_segment(
        file.filename or "upload", "upload",
    )
    # Short random prefix avoids collisions on repeat
    # uploads of the same filename without exposing a long
    # opaque id in the markdown.
    prefix = uuid.uuid4().hex[:8]
    stored_name = f"{prefix}-{safe_name}"

    root = _attachments_root()
    bucket_dir = root / bucket
    bucket_dir.mkdir(parents=True, exist_ok=True)
    dest = _resolve_within(root, bucket_dir / stored_name)

    written = 0
    with dest.open("wb") as fh:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_BYTES:
                fh.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"file exceeds {MAX_BYTES} bytes"
                    ),
                )
            fh.write(chunk)

    return {
        "url": (
            f"/api/attachments/{bucket}/{stored_name}"
        ),
        "name": safe_name,
        "size": written,
    }


# Inline-safe image mimes. SVG is deliberately excluded
# because it can carry script and would execute same-origin
# when fetched from ``/api/attachments/...``. Everything
# else is forced to download with a sandboxing CSP so a
# crafted HTML / XML / SVG upload cannot XSS the app.
_INLINE_IMAGE_MIMES = frozenset({
    "image/png", "image/jpeg", "image/gif",
    "image/webp", "image/bmp",
})


@router.get("/{bucket}/{filename}")
def get_attachment(bucket: str, filename: str):
    """Serve a previously uploaded attachment.

    Refuses any path that does not resolve cleanly under
    the profile's attachments dir. Only a narrow allowlist
    of raster image mimes is served inline; anything else
    is forced as a download so user-supplied HTML / SVG
    cannot XSS the app.
    """
    safe_bucket = _safe_segment(bucket, "_misc")
    safe_file = _safe_segment(filename, "upload")
    root = _attachments_root()
    target = _resolve_within(
        root, root / safe_bucket / safe_file,
    )
    if not target.is_file():
        raise HTTPException(
            status_code=404, detail="attachment not found",
        )
    mime, _ = mimetypes.guess_type(target)
    inline = (mime or "") in _INLINE_IMAGE_MIMES
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": (
            "default-src 'none'; sandbox"
        ),
    }
    if inline:
        return FileResponse(
            target, media_type=mime, headers=headers,
        )
    # Strip the original filename's path bits before
    # echoing into Content-Disposition.
    display = safe_file or "download"
    headers["Content-Disposition"] = (
        f'attachment; filename="{display}"'
    )
    return FileResponse(
        target,
        media_type="application/octet-stream",
        headers=headers,
    )
