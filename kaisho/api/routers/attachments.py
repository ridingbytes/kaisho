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

MAX_BYTES = 25 * 1024 * 1024  # 25 MiB per file
# Per-bucket ceilings so a runaway client can't fill the
# disk one small file at a time (the per-file cap alone
# doesn't bound the total).
MAX_BUCKET_FILES = 200
MAX_BUCKET_BYTES = 200 * 1024 * 1024  # 200 MiB per bucket

_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9._-]+")


def _attachments_root() -> Path:
    return get_config().PROFILE_DIR / "attachments"


def _bucket_usage(bucket_dir: Path) -> tuple[int, int]:
    """Return ``(file_count, total_bytes)`` for a bucket.
    Missing dir reads as empty."""
    if not bucket_dir.is_dir():
        return 0, 0
    files = [p for p in bucket_dir.iterdir() if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    return len(files), total


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
    :param task_id: the bucket to store the file under
        (any owning entity id -- a task id, or a project id
        for the project files panel). Named ``task_id`` for
        backwards compatibility; treated purely as an opaque
        bucket segment.
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

    # Refuse before writing if the bucket is already at its
    # file-count ceiling.
    existing_count, existing_bytes = _bucket_usage(
        bucket_dir,
    )
    if existing_count >= MAX_BUCKET_FILES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"bucket already has {MAX_BUCKET_FILES} "
                "files"
            ),
        )

    written = 0
    with dest.open("wb") as fh:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            over_file = written > MAX_BYTES
            over_bucket = (
                existing_bytes + written > MAX_BUCKET_BYTES
            )
            if over_file or over_bucket:
                fh.close()
                dest.unlink(missing_ok=True)
                detail = (
                    f"file exceeds {MAX_BYTES} bytes"
                    if over_file
                    else (
                        "bucket exceeds "
                        f"{MAX_BUCKET_BYTES} bytes"
                    )
                )
                raise HTTPException(
                    status_code=413, detail=detail,
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


@router.get("/{bucket}")
def list_bucket(bucket: str):
    """List the files stored in a bucket.

    Used by the project workspace to show and manage the
    files dragged into a project (bucket = project id).
    Returns the stored name (for URL / delete), a display
    name with the random prefix stripped, the serve URL,
    and the size.
    """
    safe_bucket = _safe_segment(bucket, "_misc")
    root = _attachments_root()
    bucket_dir = _resolve_within(root, root / safe_bucket)
    if not bucket_dir.is_dir():
        return {"files": []}
    files = []
    for path in sorted(bucket_dir.iterdir()):
        if not path.is_file():
            continue
        stored = path.name
        # Stored names are ``<8-hex>-<name>``; strip the
        # prefix for a friendlier display name.
        display = (
            stored[9:]
            if len(stored) > 9 and stored[8] == "-"
            else stored
        )
        files.append({
            "name": stored,
            "display": display,
            "url": f"/api/attachments/{safe_bucket}/{stored}",
            "size": path.stat().st_size,
        })
    return {"files": files}


@router.delete("/{bucket}/{filename}", status_code=204)
def delete_attachment(bucket: str, filename: str):
    """Delete a single attachment from a bucket."""
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
    target.unlink()


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
