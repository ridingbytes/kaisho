import json
import urllib.request
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

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
    merged["customer_types"] = (
        settings_svc.get_customer_types(data)
    )
    return merged


@router.post("/states", status_code=201)
def add_state(body: StateCreate):
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


class StateUpdate(BaseModel):
    label: str | None = None
    color: str | None = None
    done: bool | None = None


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
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    states = data.get("task_states", [])
    data["task_states"] = [
        s for s in states if s["name"] != name
    ]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


@router.post("/tags", status_code=201)
def add_tag(body: TagCreate):
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
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    types = settings_svc.get_customer_types(data)
    data["customer_types"] = [
        t for t in types if t != name.upper()
    ]
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)


# ---------------------------------------------------------------
# AI settings
# ---------------------------------------------------------------


def _claude_cli_status() -> dict:
    """Check if claude CLI is installed and authenticated."""
    import shutil
    import subprocess
    path = shutil.which("claude")
    if not path:
        return {
            "installed": False,
            "authenticated": False,
            "version": "",
            "path": "",
        }
    try:
        result = subprocess.run(
            [path, "--version"],
            capture_output=True, text=True, timeout=5,
        )
        version = result.stdout.strip().split("\n")[0]
    except Exception:
        version = "unknown"
    creds = Path.home() / ".claude"
    authenticated = creds.is_dir() and any(
        creds.iterdir()
    )
    return {
        "installed": True,
        "authenticated": authenticated,
        "version": version,
        "path": path,
    }


_CLAUDE_API_MODELS = [
    "claude:claude-opus-4-6",
    "claude:claude-sonnet-4-6",
    "claude:claude-haiku-4-5-20251001",
]

_CLAUDE_CLI_MODELS = [
    "claude_cli:claude-opus-4-6",
    "claude_cli:claude-sonnet-4-6",
    "claude_cli:claude-haiku-4-5-20251001",
]


def _fetch_ollama_models(base_url: str) -> list[str]:
    url = base_url.rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(
            url, timeout=3,
        ) as resp:
            data = json.loads(resp.read())
        return [
            f"ollama:{m['name']}"
            for m in data.get("models", [])
        ]
    except Exception:
        return []


def _fetch_lm_studio_models(
    base_url: str,
) -> list[str]:
    if not base_url:
        return []
    url = base_url.rstrip("/") + "/v1/models"
    try:
        with urllib.request.urlopen(
            url, timeout=3,
        ) as resp:
            data = json.loads(resp.read())
        return [
            f"lm_studio:{m['id']}"
            for m in data.get("data", [])
        ]
    except Exception:
        return []


def _fetch_openai_compatible_models(
    base_url: str, api_key: str, prefix: str,
) -> list[str]:
    """Fetch models from an OpenAI-compatible endpoint."""
    if not base_url:
        return []
    url = base_url.rstrip("/") + "/models"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(
            req, timeout=5,
        ) as resp:
            data = json.loads(resp.read())
        return [
            f"{prefix}:{m['id']}"
            for m in data.get("data", [])
        ]
    except Exception:
        return []


class AiSettingsUpdate(BaseModel):
    ollama_url: str | None = None
    lm_studio_url: str | None = None
    claude_api_key: str | None = None
    openrouter_url: str | None = None
    openrouter_api_key: str | None = None
    openai_url: str | None = None
    openai_api_key: str | None = None
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
    return settings_svc.set_ai_settings(
        cfg.SETTINGS_FILE, updates,
    )


@router.get("/ai/models")
def list_models():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    ai = settings_svc.get_ai_settings(data)
    models = (
        _fetch_ollama_models(ai["ollama_url"])
        + _fetch_lm_studio_models(
            ai.get("lm_studio_url", ""),
        )
        + _fetch_openai_compatible_models(
            ai.get("openrouter_url", ""),
            ai.get("openrouter_api_key", ""),
            "openrouter",
        )
        + _fetch_openai_compatible_models(
            ai.get("openai_url", ""),
            ai.get("openai_api_key", ""),
            "openai",
        )
        + _CLAUDE_CLI_MODELS
        + _CLAUDE_API_MODELS
    )
    return {"models": models}


@router.get("/ai/claude_cli")
def get_claude_cli_status():
    """Check if the Claude CLI is installed."""
    return _claude_cli_status()


# ---------------------------------------------------------------
# Paths and backend
# ---------------------------------------------------------------


@router.get("/paths")
def get_paths():
    """Return path and backend config for the active profile.

    All values come from the profile's settings.yaml,
    falling back to global config (.env) when not set.
    """
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    paths = settings_svc.get_path_settings(data, cfg)
    sql_dsn = paths.get("sql_dsn", "")
    if not sql_dsn:
        sql_dsn = (
            f"sqlite:///{cfg.PROFILE_DIR / 'kaisho.db'}"
        )
    return {
        "org_dir": paths["org_dir"],
        "markdown_dir": paths["markdown_dir"],
        "json_dir": paths["json_dir"],
        "sql_dsn": sql_dsn,
        "data_dir": str(cfg.DATA_DIR.expanduser()),
        "profile": cfg.PROFILE,
        "profile_dir": str(cfg.PROFILE_DIR),
        "settings_file": str(cfg.SETTINGS_FILE),
        "backend": paths["backend"],
    }


class PathsUpdate(BaseModel):
    org_dir: str | None = None
    markdown_dir: str | None = None
    json_dir: str | None = None
    sql_dsn: str | None = None
    backend: str | None = None


@router.patch("/paths")
def update_paths(body: PathsUpdate):
    """Save path/backend settings to settings.yaml."""
    cfg = get_config()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return {"message": "Nothing to update."}
    settings_svc.set_path_settings(
        cfg.SETTINGS_FILE, updates,
    )
    from ...backends import reset_backend
    reset_backend()
    return {"message": "Paths saved."}


class BackendSwitch(BaseModel):
    backend: str


@router.put("/backend")
def switch_backend(body: BackendSwitch):
    """Switch the storage backend for this profile."""
    valid = ("org", "markdown", "json", "sql")
    if body.backend not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"backend must be one of: {valid}",
        )
    cfg = get_config()
    settings_svc.set_path_settings(
        cfg.SETTINGS_FILE,
        {"backend": body.backend},
    )
    from ...backends import reset_backend
    reset_backend()
    return {
        "backend": body.backend,
        "message": (
            f"Switched to {body.backend} backend."
        ),
    }


# ---------------------------------------------------------------
# Import data
# ---------------------------------------------------------------


class ImportData(BaseModel):
    source_format: str
    source_path: str


@router.post("/import-data")
def import_data(body: ImportData):
    """Import data from another backend."""
    valid = ("org", "markdown", "json", "sql")
    if body.source_format not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"Format must be one of: {valid}",
        )
    from ...backends import get_backend
    from ...services.convert import (
        convert_backend,
        make_backend_from_spec,
    )
    source = make_backend_from_spec(
        body.source_format, body.source_path,
    )
    target = get_backend()
    summary = convert_backend(source, target)
    return {"summary": summary}


# ---------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------


@router.get("/github")
def get_github():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    result = settings_svc.get_github_settings(data)
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
    return settings_svc.set_github_settings(
        cfg.SETTINGS_FILE, updates,
    )


# ---------------------------------------------------------------
# Timezone
# ---------------------------------------------------------------


@router.get("/timezone")
def get_timezone_setting():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return {
        "timezone": settings_svc.get_timezone(data),
    }


class TimezoneUpdate(BaseModel):
    timezone: str


@router.patch("/timezone")
def update_timezone(body: TimezoneUpdate):
    cfg = get_config()
    tz = settings_svc.set_timezone(
        cfg.SETTINGS_FILE, body.timezone,
    )
    return {"timezone": tz}


# ---------------------------------------------------------------
# Knowledge base sources
# ---------------------------------------------------------------


@router.get("/kb_sources")
def get_kb_sources():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_kb_sources(data, cfg)


@router.put("/kb_sources")
def set_kb_sources(body: list[dict] = Body(...)):
    cfg = get_config()
    return settings_svc.set_kb_sources(
        cfg.SETTINGS_FILE, body,
    )


# ---------------------------------------------------------------
# Advisor personality files (SOUL.md / USER.md)
# ---------------------------------------------------------------


class AdvisorFilesUpdate(BaseModel):
    soul: str | None = None
    user: str | None = None


def _advisor_file_path(filename: str) -> Path:
    cfg = get_config()
    return cfg.PROFILE_DIR / filename


def _read_advisor_file(filename: str) -> str:
    path = _advisor_file_path(filename)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _write_advisor_file(
    filename: str, content: str,
) -> None:
    path = _advisor_file_path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@router.get("/advisor_files")
def get_advisor_files():
    return {
        "soul": _read_advisor_file("SOUL.md"),
        "user": _read_advisor_file("USER.md"),
    }


@router.put("/advisor_files")
def put_advisor_files(body: AdvisorFilesUpdate):
    if body.soul is not None:
        _write_advisor_file("SOUL.md", body.soul)
    if body.user is not None:
        _write_advisor_file("USER.md", body.user)
    return {
        "soul": _read_advisor_file("SOUL.md"),
        "user": _read_advisor_file("USER.md"),
    }


# ---------------------------------------------------------------
# URL allowlist
# ---------------------------------------------------------------


@router.get("/url_allowlist")
def get_url_allowlist():
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    return settings_svc.get_url_allowlist(data)


@router.put("/url_allowlist")
def set_url_allowlist(body: list[str] = Body(...)):
    cfg = get_config()
    data = settings_svc.load_settings(cfg.SETTINGS_FILE)
    data["url_allowlist"] = body
    settings_svc.save_settings(cfg.SETTINGS_FILE, data)
    return body


# ---------------------------------------------------------------
# User and profiles
# ---------------------------------------------------------------


@router.get("/user")
def get_current_user():
    """Return the active profile info."""
    from ...config import list_profiles, load_user_yaml
    cfg = get_config()
    meta = load_user_yaml(cfg)
    return {
        "profile": cfg.PROFILE,
        "name": meta.get("name", ""),
        "email": meta.get("email", ""),
        "bio": meta.get("bio", ""),
        "avatar_seed": meta.get("avatar_seed", ""),
        "profiles": list_profiles(cfg),
    }


class UserProfileUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    bio: str | None = None
    avatar_seed: str | None = None


@router.patch("/user/profile")
def update_user_profile(body: UserProfileUpdate):
    """Update name, email, bio in user.yaml."""
    from ...config import load_user_yaml, save_user_yaml
    cfg = get_config()
    data = load_user_yaml(cfg)
    if body.name is not None:
        data["name"] = body.name
    if body.email is not None:
        data["email"] = body.email
    if body.bio is not None:
        data["bio"] = body.bio
    if body.avatar_seed is not None:
        data["avatar_seed"] = body.avatar_seed
    save_user_yaml(cfg, data)
    return data


@router.get("/profiles")
def get_profiles():
    """List profiles."""
    from ...config import list_profiles
    cfg = get_config()
    return {
        "active": cfg.PROFILE,
        "profiles": list_profiles(cfg),
    }


class ProfileSwitch(BaseModel):
    profile: str


@router.put("/profile")
def switch_profile(body: ProfileSwitch):
    """Switch to a different profile."""
    import os
    from ...backends import reset_backend
    from ...config import (
        init_data_dir,
        reset_config,
        save_active_profile,
    )
    os.environ["PROFILE"] = body.profile
    cfg = reset_config()
    init_data_dir(cfg)
    reset_backend()
    save_active_profile(cfg.DATA_DIR, cfg.PROFILE)
    return {
        "profile": cfg.PROFILE,
    }


class ProfileCreate(BaseModel):
    name: str


@router.post("/profiles", status_code=201)
def create_profile(body: ProfileCreate):
    """Create a new profile."""
    import os
    import re
    from ...config import init_data_dir, reset_config
    name = re.sub(
        r"[^a-zA-Z0-9_-]", "", body.name.strip(),
    )
    if not name:
        raise HTTPException(
            status_code=400,
            detail="Invalid profile name",
        )
    cfg = get_config()
    profile_dir = (
        cfg.DATA_DIR / "profiles" / name
    )
    if profile_dir.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Profile '{name}' already exists",
        )
    old = os.environ.get("PROFILE")
    os.environ["PROFILE"] = name
    new_cfg = reset_config()
    init_data_dir(new_cfg)
    if old is not None:
        os.environ["PROFILE"] = old
    else:
        os.environ.pop("PROFILE", None)
    reset_config()
    return {"name": name}


class ProfileRename(BaseModel):
    new_name: str


@router.put("/profiles/{name}")
def rename_profile_endpoint(
    name: str, body: ProfileRename,
):
    """Rename a profile.

    The active profile cannot be renamed.
    """
    from ...config import rename_profile
    try:
        rename_profile(name, body.new_name)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=str(exc),
        )
    return {"name": body.new_name}


class ProfileCopy(BaseModel):
    target: str


@router.post(
    "/profiles/{name}/copy", status_code=201,
)
def copy_profile_endpoint(
    name: str, body: ProfileCopy,
):
    """Copy a profile to a new name."""
    from ...config import copy_profile
    try:
        copy_profile(name, body.target)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=str(exc),
        )
    return {"name": body.target}


@router.delete("/profiles/{name}", status_code=204)
def delete_profile_endpoint(name: str):
    """Delete a profile and all its data.

    The active profile cannot be deleted.
    """
    from ...config import delete_profile
    try:
        delete_profile(name)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=str(exc),
        )
