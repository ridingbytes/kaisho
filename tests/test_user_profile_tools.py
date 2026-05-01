"""Tests for the get_user_profile / update_user_profile
advisor tools that drive the /onboard flow."""

import pytest


@pytest.fixture
def isolated_profile(tmp_path, monkeypatch):
    """Spin up an isolated Kaisho home with one profile."""
    home = tmp_path / ".kaisho"
    home.mkdir()
    monkeypatch.setenv("KAISHO_HOME", str(home))
    monkeypatch.setenv("PROFILE", "alpha")
    from kaisho.config import init_data_dir, reset_config
    cfg = reset_config()
    init_data_dir(cfg)
    yield cfg
    reset_config()


def test_get_returns_template_when_empty(isolated_profile):
    from kaisho.cron.tools import _get_user_profile
    result = _get_user_profile({})
    assert result["profile"] == "alpha"
    assert result["name"] == ""
    assert result["bio"] == ""
    assert result["company"] == ""
    assert result["industry"] == ""
    assert result["research_targets"] == []


def test_update_writes_only_provided_fields(isolated_profile):
    from kaisho.cron.tools import (
        _get_user_profile, _update_user_profile,
    )
    _update_user_profile({"name": "Alice", "bio": "Builder"})
    after = _get_user_profile({})
    assert after["name"] == "Alice"
    assert after["bio"] == "Builder"
    # Untouched fields stay empty
    assert after["company"] == ""
    assert after["industry"] == ""


def test_update_preserves_unspecified_fields(isolated_profile):
    from kaisho.cron.tools import (
        _get_user_profile, _update_user_profile,
    )
    _update_user_profile({"name": "Alice", "company": "Acme"})
    _update_user_profile({"industry": "fintech"})
    final = _get_user_profile({})
    assert final["name"] == "Alice"
    assert final["company"] == "Acme"
    assert final["industry"] == "fintech"


def test_update_filters_empty_research_targets(isolated_profile):
    from kaisho.cron.tools import (
        _get_user_profile, _update_user_profile,
    )
    _update_user_profile({
        "research_targets": ["llm", "  ", "agents", ""],
    })
    assert _get_user_profile({})["research_targets"] == [
        "llm", "agents",
    ]


def test_update_research_targets_accepts_string(isolated_profile):
    from kaisho.cron.tools import (
        _get_user_profile, _update_user_profile,
    )
    _update_user_profile({
        "research_targets": "llm\nagents\n",
    })
    assert _get_user_profile({})["research_targets"] == [
        "llm", "agents",
    ]


def test_update_rejects_bad_research_targets_type(isolated_profile):
    from kaisho.cron.tools import _update_user_profile
    result = _update_user_profile({"research_targets": 42})
    assert "error" in result


def test_update_rejects_non_string_scalar(isolated_profile):
    """A model that emits ``{"name": {"first": "X"}}`` must
    be rejected, not silently coerced via ``str()``."""
    from kaisho.cron.tools import (
        _get_user_profile, _update_user_profile,
    )
    result = _update_user_profile({"name": {"first": "X"}})
    assert "error" in result
    assert _get_user_profile({})["name"] == ""


def test_save_user_yaml_is_atomic(isolated_profile, monkeypatch):
    """A crash mid-write must not leave a truncated file."""
    import yaml as _yaml
    from kaisho.config import (
        load_user_yaml, save_user_yaml,
    )

    # Seed the profile with a known good user.yaml so a
    # later crash is testable against it.
    save_user_yaml(isolated_profile, {"name": "Original"})
    assert (
        load_user_yaml(isolated_profile)["name"]
        == "Original"
    )

    real_dump = _yaml.dump

    def boom(*a, **kw):
        # Simulate a crash AFTER yaml has written into the
        # tmp file but BEFORE the atomic replace.
        real_dump(*a, **kw)
        raise RuntimeError("simulated crash")

    monkeypatch.setattr(_yaml, "dump", boom)
    try:
        save_user_yaml(
            isolated_profile, {"name": "Half-written"},
        )
    except RuntimeError:
        pass

    # Original user.yaml must still be intact: tmp file was
    # never replaced into place.
    assert (
        load_user_yaml(isolated_profile)["name"]
        == "Original"
    )


def test_idempotent_get_after_update(isolated_profile):
    """Running get -> update with same values -> get
    returns the same profile (no surprise mutations)."""
    from kaisho.cron.tools import (
        _get_user_profile, _update_user_profile,
    )
    _update_user_profile({
        "name": "A", "bio": "B", "company": "C",
        "industry": "D", "research_targets": ["x", "y"],
    })
    first = _get_user_profile({})
    _update_user_profile({k: first[k] for k in (
        "name", "bio", "company", "industry",
        "research_targets",
    )})
    second = _get_user_profile({})
    assert first == second


def test_tools_registered_in_dispatch():
    """Both tools must be in the dispatch table and the
    public TOOL_DEFS, otherwise the advisor cannot call
    them by name."""
    from kaisho.cron.tools import _HANDLERS, openai_tools
    assert "get_user_profile" in _HANDLERS
    assert "update_user_profile" in _HANDLERS
    names = {
        t["function"]["name"] for t in openai_tools()
    }
    assert "get_user_profile" in names
    assert "update_user_profile" in names


def test_update_then_render_pipeline(isolated_profile):
    """End-to-end: write profile via the tool, then render
    a prompt that uses every user.* placeholder. Catches
    drift between the canonical USER_FIELDS list and the
    individual call sites (config template, get/update
    tool, render layer)."""
    from kaisho.config import load_user_yaml
    from kaisho.cron.tools import _update_user_profile
    from kaisho.services.placeholders import (
        USER_FIELDS, render_placeholders,
    )

    payload = {
        "name": "Alice",
        "email": "a@example.com",
        "bio": "Engineer",
        "company": "Acme",
        "industry": "fintech",
        "research_targets": ["llm", "agents"],
    }
    _update_user_profile(payload)

    # Build a prompt that mentions every known user field.
    body = "\n".join(
        f"{f}: ${{user.{f}}}" for f in USER_FIELDS
    )
    rendered, unresolved = render_placeholders(
        body, user=load_user_yaml(isolated_profile),
    )
    assert unresolved == []
    assert "name: Alice" in rendered
    assert "email: a@example.com" in rendered
    assert "bio: Engineer" in rendered
    assert "company: Acme" in rendered
    assert "industry: fintech" in rendered
    # research_targets renders as a markdown bullet list.
    assert "- llm" in rendered
    assert "- agents" in rendered


def test_get_is_cron_safe_update_is_not():
    """Cron should be able to read but not write the
    user profile."""
    from kaisho.cron.tools import cron_safe_tool_defs
    safe = {t["name"] for t in cron_safe_tool_defs()}
    assert "get_user_profile" in safe
    assert "update_user_profile" not in safe
