from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import knowledge as kb_service

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class FileWrite(BaseModel):
    label: str   # "wissen" or "research"
    path: str    # relative path, e.g. "senaite/notes.md"
    content: str


def _cfg():
    return get_config()


@router.get("/tree")
def get_tree():
    cfg = _cfg()
    return kb_service.file_tree(cfg.WISSEN_DIR, cfg.RESEARCH_DIR)


@router.get("/file")
def get_file(path: str):
    cfg = _cfg()
    content = kb_service.read_file(
        cfg.WISSEN_DIR, cfg.RESEARCH_DIR, path
    )
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    return {"path": path, "content": content}


@router.get("/search")
def search_kb(q: str, max_results: int = 20):
    cfg = _cfg()
    return kb_service.search(
        cfg.WISSEN_DIR, cfg.RESEARCH_DIR, q,
        max_results=max_results,
    )


@router.put("/file", status_code=200)
def write_file(body: FileWrite):
    if body.label not in ("wissen", "research"):
        raise HTTPException(
            status_code=400, detail="label must be 'wissen' or 'research'"
        )
    cfg = _cfg()
    return kb_service.write_file(
        cfg.WISSEN_DIR, cfg.RESEARCH_DIR,
        body.label, body.path, body.content,
    )


@router.delete("/file", status_code=204)
def delete_file(path: str):
    cfg = _cfg()
    found = kb_service.delete_file(cfg.WISSEN_DIR, cfg.RESEARCH_DIR, path)
    if not found:
        raise HTTPException(status_code=404, detail="File not found")
