import json
import urllib.request

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ...config import get_config
from ...services import settings as settings_svc

router = APIRouter(prefix="/api/settings", tags=["settings"])


class StateCreate(BaseModel):
    name: str
    label: str
    color: str
    done: bool = False
    after: str | None = None   # insert after this state name


class TagCreate(BaseModel):
    name: str
    color: str
    description: str = ""


class TagUpdate(BaseModel):
    color: str | None = None
    description: str | None = None


@router.get("/")
def get_settings():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    merged = dict(data)
    merged["customer_types"] = settings_svc.get_customer_types(data)
    return merged


@router.post("/states", status_code=201)
def add_state(body: StateCreate):
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    if any(s["name"] == body.name for s in states):
        raise HTTPException(
            status_code=409, detail="State already exists"
        )
    new_state = {
        "name": body.name,
        "label": body.label,
        "color": body.color,
        "done": body.done,
    }
    if body.after:
        idx = next(
            (
                i for i, s in enumerate(states)
                if s["name"] == body.after
            ),
            None,
        )
        if idx is not None:
            states.insert(idx + 1, new_state)
        else:
            states.append(new_state)
    else:
        states.append(new_state)
    data["task_states"] = states
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return new_state


@router.put("/states/order", status_code=200)
def reorder_states(body: list[str] = Body(...)):
    """Reorder a subset of task_states.

    States not present in body keep their position relative to each
    other and are interleaved with the reordered states in-place.
    This preserves hidden states (e.g. done=true) when reordering
    the visible subset.
    """
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    all_states = data.get("task_states", [])
    state_map = {s["name"]: s for s in all_states}
    body_set = set(body)

    # States not in body stay at their original indices, interleaved
    others = [s for s in all_states if s["name"] not in body_set]
    reordered = [state_map[n] for n in body if n in state_map]

    # Reconstruct: fill slots occupied by body states with reordered,
    # keep other states in their original relative order
    body_positions = sorted(
        i for i, s in enumerate(all_states) if s["name"] in body_set
    )
    result: list[dict] = list(all_states)
    for pos, state in zip(body_positions, reordered):
        result[pos] = state
    other_positions = [
        i for i, s in enumerate(all_states) if s["name"] not in body_set
    ]
    for pos, state in zip(other_positions, others):
        result[pos] = state

    data["task_states"] = result
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return data["task_states"]


@router.delete("/states/{name}", status_code=204)
def remove_state(name: str):
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    data["task_states"] = [s for s in states if s["name"] != name]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


@router.post("/tags", status_code=201)
def add_tag(body: TagCreate):
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    tags = data.get("tags", [])
    if any(t["name"] == body.name for t in tags):
        raise HTTPException(
            status_code=409, detail="Tag already exists"
        )
    new_tag = {
        "name": body.name,
        "color": body.color,
        "description": body.description,
    }
    tags.append(new_tag)
    data["tags"] = tags
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return new_tag


@router.patch("/tags/{name}")
def update_tag(name: str, body: TagUpdate):
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    tags = data.get("tags", [])
    tag = next((t for t in tags if t["name"] == name), None)
    if tag is None:
        raise HTTPException(
            status_code=404, detail="Tag not found"
        )
    if body.color is not None:
        tag["color"] = body.color
    if body.description is not None:
        tag["description"] = body.description
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return tag


@router.delete("/tags/{name}", status_code=204)
def remove_tag(name: str):
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    data["tags"] = [
        t for t in data.get("tags", []) if t["name"] != name
    ]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


# ---------------------------------------------------------------------------
# Customer types
# ---------------------------------------------------------------------------


@router.post("/customer_types", status_code=201)
def add_customer_type(body: dict = Body(...)):
    name = body.get("name", "").strip().upper()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    types = settings_svc.get_customer_types(data)
    if name in types:
        raise HTTPException(status_code=409, detail="Type already exists")
    types.append(name)
    data["customer_types"] = types
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return {"customer_types": types}


@router.delete("/customer_types/{name}", status_code=204)
def remove_customer_type(name: str):
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    types = settings_svc.get_customer_types(data)
    data["customer_types"] = [t for t in types if t != name.upper()]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


# ---------------------------------------------------------------------------
# AI settings
# ---------------------------------------------------------------------------

_CLAUDE_MODELS = [
    "claude:claude-opus-4-6",
    "claude:claude-sonnet-4-6",
    "claude:claude-haiku-4-5-20251001",
]


def _fetch_ollama_models(base_url: str) -> list[str]:
    url = base_url.rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read())
        return [
            f"ollama:{m['name']}" for m in data.get("models", [])
        ]
    except Exception:
        return []


def _fetch_lm_studio_models(base_url: str) -> list[str]:
    if not base_url:
        return []
    url = base_url.rstrip("/") + "/v1/models"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read())
        return [
            f"lm_studio:{m['id']}" for m in data.get("data", [])
        ]
    except Exception:
        return []


class AiSettingsUpdate(BaseModel):
    ollama_url: str | None = None
    lm_studio_url: str | None = None
    claude_api_key: str | None = None
    advisor_model: str | None = None
    cron_model: str | None = None


@router.get("/ai")
def get_ai():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_ai_settings(data)


@router.patch("/ai")
def update_ai(body: AiSettingsUpdate):
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    return settings_svc.set_ai_settings(cfg.SETTINGS_FILE, updates)


@router.get("/paths")
def get_paths():
    """Return current file path configuration (read-only)."""
    cfg = get_config()
    return {
        "org_dir": str(cfg.ORG_DIR.expanduser()),
        "todos_file": str(cfg.TODOS_FILE),
        "clocks_file": str(cfg.CLOCKS_FILE),
        "inbox_file": str(cfg.INBOX_FILE),
        "notes_file": str(cfg.NOTES_FILE),
        "archive_file": str(cfg.ARCHIVE_FILE),
        "kunden_file": str(cfg.KUNDEN_FILE),
        "wissen_dir": str(cfg.WISSEN_DIR.expanduser()),
        "research_dir": str(cfg.RESEARCH_DIR.expanduser()),
        "data_dir": str(cfg.DATA_DIR.expanduser()),
        "settings_file": str(cfg.SETTINGS_FILE.expanduser()),
        "backend": cfg.BACKEND,
    }


@router.get("/github")
def get_github():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    result = settings_svc.get_github_settings(data)
    # Mask token for display — show only last 4 chars
    token = result.get("token", "")
    result["token_set"] = bool(token)
    if token:
        result["token"] = "..." + token[-4:]
    return result


class GithubSettingsUpdate(BaseModel):
    token: str | None = None
    base_url: str | None = None


@router.patch("/github")
def update_github(body: GithubSettingsUpdate):
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    return settings_svc.set_github_settings(cfg.SETTINGS_FILE, updates)


@router.get("/ai/models")
def list_models():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    models = (
        _fetch_ollama_models(ai["ollama_url"])
        + _fetch_lm_studio_models(ai.get("lm_studio_url", ""))
        + _CLAUDE_MODELS
    )
    return {"models": models}
