from fastapi import APIRouter, HTTPException

from ...config import get_config
from ...services import knowledge as kb_service

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


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
