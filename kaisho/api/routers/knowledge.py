from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import knowledge as kb_service
from ...services import settings as settings_svc

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class FileWrite(BaseModel):
    label: str
    path: str
    content: str


def _sources() -> list[dict]:
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_kb_sources(data, cfg)


@router.get("/tree")
def get_tree():
    return kb_service.file_tree(_sources())


@router.get("/file")
def get_file(path: str):
    content = kb_service.read_file(_sources(), path)
    if content is None:
        raise HTTPException(
            status_code=404, detail="File not found"
        )
    return {"path": path, "content": content}


@router.get("/search")
def search_kb(q: str, max_results: int = 20):
    return kb_service.search(
        _sources(), q, max_results=max_results,
    )


@router.put("/file", status_code=200)
def write_file(body: FileWrite):
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
def delete_file(path: str):
    found = kb_service.delete_file(_sources(), path)
    if not found:
        raise HTTPException(
            status_code=404, detail="File not found"
        )
