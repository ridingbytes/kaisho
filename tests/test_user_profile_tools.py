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


def test_get_is_cron_safe_update_is_not():
    """Cron should be able to read but not write the
    user profile."""
    from kaisho.cron.tools import cron_safe_tool_defs
    safe = {t["name"] for t in cron_safe_tool_defs()}
    assert "get_user_profile" in safe
    assert "update_user_profile" not in safe
