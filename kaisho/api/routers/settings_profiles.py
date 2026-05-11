import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...config import get_config

router = APIRouter(
    prefix="/api/settings", tags=["settings"],
)

_PROFILE_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_profile_name(name: str) -> str:
    """Sanitize and validate a profile name.

    :param name: Raw profile name.
    :returns: Cleaned name.
    :raises HTTPException: If name is empty or contains
        invalid characters.
    """
    cleaned = re.sub(
        r"[^a-zA-Z0-9_-]", "", name.strip(),
    )
    if not cleaned:
        raise HTTPException(
            status_code=400,
            detail="Invalid profile name",
        )
    return cleaned


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
        "avatar_style": meta.get("avatar_style", ""),
        "company": meta.get("company", ""),
        "industry": meta.get("industry", ""),
        "research_targets": (
            meta.get("research_targets") or []
        ),
        "profiles": list_profiles(cfg),
    }


class UserProfileUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    bio: str | None = None
    avatar_seed: str | None = None
    avatar_style: str | None = None
    company: str | None = None
    industry: str | None = None
    research_targets: list[str] | None = None


@router.patch("/user/profile")
def update_user_profile(body: UserProfileUpdate):
    """Update user.yaml fields, including the placeholder
    fields surfaced via ``${user.<field>}`` in cron and
    advisor prompts (company, industry, research_targets).
    """
    from ...config import load_user_yaml, save_user_yaml
    cfg = get_config()
    data = load_user_yaml(cfg)
    for field in (
        "name", "email", "bio",
        "avatar_seed", "avatar_style",
        "company", "industry",
    ):
        value = getattr(body, field)
        if value is not None:
            data[field] = value
    if body.research_targets is not None:
        data["research_targets"] = [
            t.strip() for t in body.research_targets
            if t and t.strip()
        ]
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
    name = _validate_profile_name(body.profile)
    os.environ["PROFILE"] = name
    cfg = reset_config()
    init_data_dir(cfg)
    reset_backend()
    save_active_profile(cfg.DATA_DIR, cfg.PROFILE)

    from ...cron.scheduler import restart_cloud_ws
    restart_cloud_ws()

    return {
        "profile": cfg.PROFILE,
    }


class ProfileCreate(BaseModel):
    name: str


@router.post("/profiles", status_code=201)
def create_profile(body: ProfileCreate):
    """Create a new profile."""
    import os
    from ...config import init_data_dir, reset_config
    name = _validate_profile_name(body.name)
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
