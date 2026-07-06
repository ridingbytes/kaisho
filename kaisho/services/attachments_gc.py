"""Reap attachment files whose markdown links were removed.

When a file is dropped into a task/note/project body, the
link ``![name](/api/attachments/<bucket>/<file>)`` is inserted
and the bytes are stored under the profile's attachments dir.
When that link is later removed from the body, the file is
orphaned; :func:`reap_removed_attachments` deletes it on the
next save so dropped files don't accumulate.
"""
import re

from ..config import get_config

_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9._-]+")
_REF_RE = re.compile(
    r"/api/attachments/([^/\s)]+)/([^/\s)?#]+)"
)


def _refs(text: str) -> set:
    """Return the ``(bucket, filename)`` pairs linked in the
    given markdown text."""
    return set(_REF_RE.findall(text or ""))


def _safe_segment(name: str, fallback: str) -> str:
    """Match the attachments router's sanitiser so we resolve
    to the same on-disk path that was written."""
    cleaned = _SAFE_SEGMENT.sub("-", name).strip("-.")
    return cleaned or fallback


def reap_removed_attachments(
    old_body: str, new_body: str,
) -> int:
    """Delete attachment files linked in ``old_body`` but no
    longer in ``new_body``. Returns the count deleted.

    Files are bucketed by the owning entity's id, so a link
    removed from that entity's body is safe to reap. Paths
    are resolved and confined to the attachments root; any
    that escape are skipped rather than deleted.
    """
    removed = _refs(old_body) - _refs(new_body)
    if not removed:
        return 0
    root = (get_config().PROFILE_DIR / "attachments").resolve()
    deleted = 0
    for bucket, name in removed:
        target = (
            root
            / _safe_segment(bucket, "_misc")
            / _safe_segment(name, "upload")
        ).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            continue
        if target.is_file():
            target.unlink()
            deleted += 1
    return deleted
