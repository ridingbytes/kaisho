from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ...backends import get_backend
from ...config import get_config
from ...services import settings as settings_svc

router = APIRouter(
    prefix="/api/settings", tags=["settings"],
)


class StateCreate(BaseModel):
    name: str
    label: str
    color: str
    done: bool = False
    after: str | None = None   # insert after this state name


class StateUpdate(BaseModel):
    label: str | None = None
    color: str | None = None
    done: bool | None = None


class TagCreate(BaseModel):
    name: str
    color: str
    description: str = ""


class TagUpdate(BaseModel):
    color: str | None = None
    description: str | None = None


@router.post("/states", status_code=201)
def add_state(body: StateCreate):
    """Add a new kanban column state."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    if any(s["name"] == body.name for s in states):
        raise HTTPException(
            status_code=409,
            detail="State already exists",
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

    States not present in body keep their position relative
    to each other and are interleaved with the reordered
    states in-place. This preserves hidden states (e.g.
    done=true) when reordering the visible subset.
    """
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    all_states = data.get("task_states", [])
    state_map = {s["name"]: s for s in all_states}
    body_set = set(body)

    others = [
        s for s in all_states
        if s["name"] not in body_set
    ]
    reordered = [
        state_map[n] for n in body if n in state_map
    ]

    body_positions = sorted(
        i for i, s in enumerate(all_states)
        if s["name"] in body_set
    )
    result: list[dict] = list(all_states)
    for pos, state in zip(body_positions, reordered):
        result[pos] = state
    other_positions = [
        i for i, s in enumerate(all_states)
        if s["name"] not in body_set
    ]
    for pos, state in zip(other_positions, others):
        result[pos] = state

    data["task_states"] = result
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return data["task_states"]


@router.patch("/states/{name}", status_code=200)
def update_state(name: str, body: StateUpdate):
    """Update label, color, and/or done flag for a state."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    for state in states:
        if state["name"] == name:
            if body.label is not None:
                state["label"] = body.label
            if body.color is not None:
                state["color"] = body.color
            if body.done is not None:
                state["done"] = body.done
            data["task_states"] = states
            settings_svc.save_settings(
                cfg.SETTINGS_FILE, data,
            )
            return state
    raise HTTPException(
        status_code=404, detail="State not found",
    )


@router.delete("/states/{name}", status_code=204)
def remove_state(name: str):
    """Delete a kanban column state.

    Refuses with 409 if any tasks are still in the
    state, since the kanban only renders columns whose
    name is in ``task_states`` — a deletion would make
    those tasks invisible without touching their data.
    Move or archive them first, then retry.
    """
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    if not any(s["name"] == name for s in states):
        raise HTTPException(
            status_code=404,
            detail=f"State '{name}' does not exist",
        )
    in_state = get_backend().tasks.list_tasks(
        status=[name], include_done=True,
    )
    if in_state:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete state '{name}': "
                f"{len(in_state)} task(s) still in this "
                f"column. Move or archive them first."
            ),
        )
    data["task_states"] = [
        s for s in states if s["name"] != name
    ]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


@router.post("/tags", status_code=201)
def add_tag(body: TagCreate):
    """Create a new tag with color and description."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    tags = data.get("tags", [])
    if any(t["name"] == body.name for t in tags):
        raise HTTPException(
            status_code=409,
            detail="Tag already exists",
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
    """Update color or description of a tag."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    tags = data.get("tags", [])
    tag = next(
        (t for t in tags if t["name"] == name), None,
    )
    if tag is None:
        raise HTTPException(
            status_code=404, detail="Tag not found",
        )
    if body.color is not None:
        tag["color"] = body.color
    if body.description is not None:
        tag["description"] = body.description
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return tag


@router.delete("/tags/{name}", status_code=204)
def remove_tag(name: str):
    """Delete a tag."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    data["tags"] = [
        t for t in data.get("tags", [])
        if t["name"] != name
    ]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


# ---------------------------------------------------------------
# Customer types
# ---------------------------------------------------------------


@router.post("/customer_types", status_code=201)
def add_customer_type(body: dict = Body(...)):
    """Add a new customer type."""
    name = body.get("name", "").strip().upper()
    if not name:
        raise HTTPException(
            status_code=400, detail="name required",
        )
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    types = settings_svc.get_customer_types(data)
    if name in types:
        raise HTTPException(
            status_code=409,
            detail="Type already exists",
        )
    types.append(name)
    data["customer_types"] = types
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return {"customer_types": types}


@router.delete("/customer_types/{name}", status_code=204)
def remove_customer_type(name: str):
    """Delete a customer type."""
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    types = settings_svc.get_customer_types(data)
    data["customer_types"] = [
        t for t in types if t != name.upper()
    ]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


# ---------------------------------------------------------------
# Inbox types and channels
# ---------------------------------------------------------------


@router.post("/inbox_types", status_code=201)
def add_inbox_type(body: dict = Body(...)):
    """Add a new inbox item type."""
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(
            status_code=400, detail="name required",
        )
    cfg = get_config()
    data = settings_svc.load_settings(
        cfg.SETTINGS_FILE,
    )
    types = settings_svc.get_inbox_types(data)
    if name in types:
        raise HTTPException(
            status_code=409,
            detail="Type already exists",
        )
    types.append(name)
    data["inbox_types"] = types
    settings_svc.save_settings(
        cfg.SETTINGS_FILE, data,
    )
    return {"inbox_types": types}


@router.delete(
    "/inbox_types/{name}", status_code=204,
)
def remove_inbox_type(name: str):
    """Delete an inbox item type."""
    cfg = get_config()
    data = settings_svc.load_settings(
        cfg.SETTINGS_FILE,
    )
    types = settings_svc.get_inbox_types(data)
    data["inbox_types"] = [
        t for t in types if t != name
    ]
    settings_svc.save_settings(
        cfg.SETTINGS_FILE, data,
    )


@router.post("/inbox_channels", status_code=201)
def add_inbox_channel(body: dict = Body(...)):
    """Add a new inbox channel."""
    name = body.get("name", "").strip().lower()
    if not name:
        raise HTTPException(
            status_code=400, detail="name required",
        )
    cfg = get_config()
    data = settings_svc.load_settings(
        cfg.SETTINGS_FILE,
    )
    channels = settings_svc.get_inbox_channels(data)
    if name in channels:
        raise HTTPException(
            status_code=409,
            detail="Channel already exists",
        )
    channels.append(name)
    data["inbox_channels"] = channels
    settings_svc.save_settings(
        cfg.SETTINGS_FILE, data,
    )
    return {"inbox_channels": channels}


@router.delete(
    "/inbox_channels/{name}", status_code=204,
)
def remove_inbox_channel(name: str):
    """Delete an inbox channel."""
    cfg = get_config()
    data = settings_svc.load_settings(
        cfg.SETTINGS_FILE,
    )
    channels = settings_svc.get_inbox_channels(data)
    data["inbox_channels"] = [
        c for c in channels if c != name
    ]
    settings_svc.save_settings(
        cfg.SETTINGS_FILE, data,
    )
