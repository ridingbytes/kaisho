from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ...config import get_config
from ...services import kb_index, summarize
from ...services import knowledge as kb_service
from ...services import settings as settings_svc
from ...services.settings import current_kb_sources

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class FileWrite(BaseModel):
    label: str
    path: str
    content: str


def _sources() -> list[dict]:
    return current_kb_sources()


def _profile_dir():
    return get_config().PROFILE_DIR


@router.get("/tree")
def get_tree():
    """Return the knowledge base file tree."""
    return kb_service.file_tree(_sources(), _profile_dir())


@router.get("/file")
def get_file(path: str):
    """Read a single knowledge base file."""
    content = kb_service.read_file(_sources(), path)
    if content is None:
        raise HTTPException(
            status_code=404, detail="File not found"
        )
    return {"path": path, "content": content}


@router.get("/file/path")
def resolve_file_path(path: str):
    """Resolve a KB-relative path to its absolute path.

    Used by the desktop app to launch the configured
    external editor against a KB file. Returns 404 when
    the file cannot be resolved (missing or path
    traversal blocked).
    """
    resolved = kb_service.resolve_path(_sources(), path)
    if resolved is None:
        raise HTTPException(
            status_code=404, detail="File not found",
        )
    return {"path": resolved}


@router.get("/file/raw")
def get_file_raw(path: str):
    """Serve a knowledge base file as raw binary.

    Used for PDF viewing and other binary formats.
    """
    from pathlib import Path as P
    from starlette.responses import FileResponse

    resolved = kb_service.resolve_path(
        _sources(), path,
    )
    if resolved is None or not P(resolved).is_file():
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )
    import mimetypes
    mime, _ = mimetypes.guess_type(resolved)
    return FileResponse(
        resolved,
        media_type=mime or "application/octet-stream",
    )


@router.get("/search")
def search_kb(
    q: str,
    max_results: int = 20,
    paths: list[str] | None = Query(default=None),
):
    """Search knowledge base files by query string.

    :param paths: Optional list of relative file paths to
        restrict the search to. Lets the UI run a filename
        filter first and search only inside the visible
        subset.
    """
    return kb_service.search(
        _sources(), q,
        max_results=max_results,
        paths=paths,
    )


@router.get("/tags")
def list_kb_tags():
    """Return the sorted unique union of free-text tags
    from the metadata index."""
    return kb_service.list_tags(_profile_dir())


@router.get("/distinct-values")
def distinct_values():
    """Return the sorted unique values for each indexable
    metadata key (``status``, ``type``, ``customer``).
    Used by the metadata editor's autocomplete dropdowns
    so the UI doesn't have to fetch the full file tree.
    """
    return kb_service.distinct_values(_profile_dir())


@router.get("/file/metadata")
def get_metadata(path: str):
    """Return the indexed metadata for a KB file."""
    meta = kb_service.get_metadata(
        _sources(), _profile_dir(), path,
    )
    if meta is None:
        raise HTTPException(
            status_code=404, detail="File not found",
        )
    return {"path": path, "metadata": meta}


class MetadataPatch(BaseModel):
    path: str
    patch: dict[str, Any]


@router.patch("/file/metadata")
def patch_metadata(body: MetadataPatch):
    """Update a KB file's metadata in the index.

    Keys in ``patch`` overwrite existing values; setting
    a canonical key to ``null`` clears it. The KB file on
    disk is never modified.
    """
    try:
        updated = kb_service.update_metadata(
            _sources(), _profile_dir(),
            body.path, body.patch,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"path": body.path, "metadata": updated}


class SummarizeRequest(BaseModel):
    path: str
    model: str | None = None
    force: bool = False


@router.post("/file/summarize")
def summarize_file(body: SummarizeRequest):
    """Summarize a KB file with the configured AI model.

    Returns the cached summary when one exists for the
    file's current content hash (``cached: true``).
    When the cache is missing, stale, or the caller
    passes ``force=true`` we re-run the model and save
    the new summary back into the index.
    """
    sources = _sources()
    label = kb_service.resolve_label(sources, body.path)
    if label is None:
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {body.path}",
        )

    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    sync = data.get("cloud_sync", {})

    cached = kb_index.get_summary(
        _profile_dir(), label, body.path,
    )
    if (
        not body.force
        and cached is not None
        and not cached["stale"]
    ):
        return {
            "path": body.path,
            "model": cached["model"],
            "summary": cached["summary"],
            "summary_at": cached["summary_at"],
            "cached": True,
            "stale": False,
            "default_inbox_text":
                summarize.build_inbox_text(body.path),
        }

    model_str = (
        body.model
        or summarize.resolve_summarize_model(ai)
    )
    try:
        summary, file_hash = summarize.summarize_kb_file(
            sources=sources,
            rel_path=body.path,
            model_str=model_str,
            ai=ai,
            cloud_url=sync.get("url", ""),
            cloud_api_key=sync.get("api_key", ""),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=404, detail=str(e),
        )

    kb_index.save_summary(
        _profile_dir(), label, body.path,
        summary=summary,
        model=model_str,
        file_hash=file_hash,
    )
    return {
        "path": body.path,
        "model": model_str,
        "summary": summary,
        "cached": False,
        "stale": False,
        "default_inbox_text":
            summarize.build_inbox_text(body.path),
    }


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    path: str
    question: str
    history: list[ChatTurn] = []
    model: str | None = None


@router.post("/file/chat")
def chat_about_file(body: ChatRequest):
    """Answer a follow-up question about a KB file.

    The full document content + cached summary (if any) +
    Q/A history are passed to the configured advisor
    model. Stateless from the server's perspective -- the
    UI keeps the history.
    """
    sources = _sources()
    label = kb_service.resolve_label(sources, body.path)
    if label is None:
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {body.path}",
        )
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    sync = data.get("cloud_sync", {})
    model_str = (
        body.model
        or summarize.resolve_summarize_model(ai)
    )
    cached = kb_index.get_summary(
        _profile_dir(), label, body.path,
    )
    cached_summary = (
        cached["summary"] if cached else ""
    )
    try:
        answer = summarize.chat_about_kb_file(
            sources=sources,
            rel_path=body.path,
            question=body.question,
            history=[t.model_dump() for t in body.history],
            model_str=model_str,
            ai=ai,
            cached_summary=cached_summary,
            cloud_url=sync.get("url", ""),
            cloud_api_key=sync.get("api_key", ""),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=404, detail=str(e),
        )
    return {
        "path": body.path,
        "model": model_str,
        "answer": answer,
    }


@router.delete("/file/summary", status_code=204)
def delete_summary(path: str):
    """Drop the cached summary for a file."""
    sources = _sources()
    label = kb_service.resolve_label(sources, path)
    if label is None:
        raise HTTPException(
            status_code=404, detail="File not found",
        )
    kb_index.clear_summary(
        _profile_dir(), label, path,
    )


class TagRenameRequest(BaseModel):
    old: str
    new: str


@router.post("/tags/rename")
def rename_tag(body: TagRenameRequest):
    """Rename a tag across the metadata index.

    Records already containing the new tag drop the old
    tag without duplicating (merge semantics).
    """
    try:
        result = kb_index.rename_tag(
            _profile_dir(), body.old, body.new,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=str(e),
        )
    return result


@router.post("/reindex")
def reindex():
    """Sync the metadata index with the current state on
    disk: hash files, detect renames, prune missing.
    Files are not modified."""
    _records, report = kb_index.reindex(
        _profile_dir(),
        kb_service.iter_kb_files(_sources()),
        apply=True,
    )
    return {
        "scanned": report.scanned,
        "added": report.added,
        "updated": report.updated,
        "renamed": report.renamed,
        "pruned": report.pruned,
        "unchanged": report.unchanged,
    }


@router.put("/file", status_code=200)
def write_file(body: FileWrite):
    """Create or overwrite a knowledge base file."""
    sources = _sources()
    labels = {s["label"] for s in sources}
    if body.label not in labels:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown KB source: {body.label!r}",
        )
    return kb_service.write_file(
        sources, body.label, body.path, body.content,
    )


class FolderCreate(BaseModel):
    label: str
    path: str


@router.post("/folder", status_code=201)
def create_folder(body: FolderCreate):
    """Create a folder in the knowledge base."""
    sources = _sources()
    labels = {s["label"] for s in sources}
    if body.label not in labels:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown KB source: {body.label!r}",
        )
    return kb_service.create_folder(
        sources, body.label, body.path,
    )


class FileRename(BaseModel):
    old_path: str
    new_path: str


class FileMove(BaseModel):
    old_path: str
    old_label: str
    new_label: str
    new_path: str | None = None


@router.post("/rename", status_code=200)
def rename_file(body: FileRename):
    """Rename or move a file within its source."""
    try:
        return kb_service.rename_file(
            _sources(), body.old_path, body.new_path,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/move", status_code=200)
def move_file(body: FileMove):
    """Move a file between KB sources."""
    try:
        return kb_service.move_file(
            _sources(), body.old_path, body.old_label,
            body.new_label, body.new_path,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/file", status_code=204)
def delete_file(path: str, confirm: bool = False):
    """Delete a knowledge base file.

    Requires ``?confirm=true`` so a misbehaving caller
    (advisor tool, MCP client, fat-fingered curl) cannot
    drop files in a single request. Mirrors the
    confirmation step the CLI applies via ``--yes``.
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail=(
                "Delete requires confirm=true. Pass "
                "?confirm=true to proceed."
            ),
        )
    found = kb_service.delete_file(_sources(), path)
    if not found:
        raise HTTPException(
            status_code=404, detail="File not found"
        )
