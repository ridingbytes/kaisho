"""Tests for the advisor's app-settings tools.

The advisor may read all settings (secrets masked) and edit
a bounded, non-secret slice. These tests pin the safe
surface: secrets never leak on read, and the write tools
validate their inputs and touch only the intended keys.
"""
import pytest

from kaisho.cron.tools import (
    advisor_safe_tool_defs,
    cron_safe_tool_defs,
    execute_tool,
)


@pytest.fixture
def clean_profile(tmp_path, monkeypatch):
    """Isolated profile that resets backend caches.

    Mirrors the fixture in ``tests/test_tool_guards.py``.
    """
    from kaisho.backends import reset_backend
    from kaisho.config import reset_config

    profile = tmp_path / "profiles" / "test"
    profile.mkdir(parents=True)
    monkeypatch.setenv("KAISHO_HOME", str(tmp_path))
    monkeypatch.setenv("PROFILE", "test")
    reset_config()
    reset_backend()
    yield profile
    reset_backend()
    reset_config()


def _settings():
    return execute_tool("get_settings", {})["settings"]


# -- Tiering -----------------------------------------------

def test_advisor_has_settings_tools():
    names = {t["name"] for t in advisor_safe_tool_defs()}
    for name in (
        "get_settings", "set_tags", "set_task_state",
        "set_list_setting", "set_clock_rounding",
        "set_backup_retention", "set_timezone",
        "set_ai_model",
    ):
        assert name in names


def test_cron_gets_only_settings_read():
    names = {t["name"] for t in cron_safe_tool_defs()}
    assert "get_settings" in names
    assert "set_tags" not in names
    assert "set_ai_model" not in names


# -- Read masks secrets ------------------------------------

def test_get_settings_masks_ai_key(clean_profile):
    execute_tool(
        "set_ai_model", {"advisor_model": "claude"},
    )
    # Seed a secret directly, then confirm it never leaks.
    from kaisho.config import get_config
    from kaisho.services import settings as ss
    ss.set_ai_settings(
        get_config().SETTINGS_FILE,
        {"claude_api_key": "sk-secret-1234"},
    )
    ai = _settings()["ai"]
    assert "claude_api_key" not in ai
    assert ai["claude_api_key_set"] is True
    assert ai["claude_api_key_preview"] == "1234"


# -- set_tags ----------------------------------------------

def test_set_tags_replaces_vocabulary(clean_profile):
    result = execute_tool(
        "set_tags",
        {"tags": [
            {"name": "@code", "color": "#f00"},
            {"name": "@admin", "description": "ops"},
        ]},
    )
    assert result["ok"] is True
    tags = _settings()["tags"]
    assert {t["name"] for t in tags} == {"@code", "@admin"}


def test_set_tags_rejects_missing_name(clean_profile):
    result = execute_tool(
        "set_tags", {"tags": [{"color": "#f00"}]},
    )
    assert "error" in result


def test_set_tags_rejects_empty(clean_profile):
    result = execute_tool("set_tags", {"tags": []})
    assert "error" in result


# -- set_task_state (upsert) -------------------------------

def test_set_task_state_adds_and_updates(clean_profile):
    execute_tool(
        "set_task_state",
        {"name": "REVIEW", "label": "Review", "color": "#0f0"},
    )
    states = {s["name"]: s for s in _settings()["task_states"]}
    assert states["REVIEW"]["label"] == "Review"

    execute_tool(
        "set_task_state",
        {
            "name": "REVIEW", "label": "In Review",
            "color": "#00f", "done": True,
        },
    )
    states = {s["name"]: s for s in _settings()["task_states"]}
    assert states["REVIEW"]["label"] == "In Review"
    assert states["REVIEW"]["done"] is True
    # Still a single REVIEW state -- upsert, not duplicate.
    names = [s["name"] for s in _settings()["task_states"]]
    assert names.count("REVIEW") == 1


def test_set_task_state_requires_label(clean_profile):
    result = execute_tool(
        "set_task_state", {"name": "X", "label": "", "color": ""},
    )
    assert "error" in result


def test_set_task_state_preserves_done_on_partial_update(
    clean_profile,
):
    """Updating only label/colour must not reset done --
    that would reclassify every task in the column."""
    execute_tool(
        "set_task_state",
        {
            "name": "SHIPPED", "label": "Shipped",
            "color": "#0f0", "done": True,
        },
    )
    # Re-edit without passing done.
    execute_tool(
        "set_task_state",
        {
            "name": "SHIPPED", "label": "Shipped ✔",
            "color": "#0a0",
        },
    )
    states = {s["name"]: s for s in _settings()["task_states"]}
    assert states["SHIPPED"]["label"] == "Shipped ✔"
    assert states["SHIPPED"]["done"] is True


# -- set_list_setting --------------------------------------

def test_set_list_setting_replaces(clean_profile):
    result = execute_tool(
        "set_list_setting",
        {"key": "customer_types", "values": ["A", "B", ""]},
    )
    assert result["ok"] is True
    assert _settings()["customer_types"] == ["A", "B"]


def test_set_list_setting_rejects_bad_key(clean_profile):
    result = execute_tool(
        "set_list_setting",
        {"key": "paths", "values": ["x"]},
    )
    assert "error" in result


# -- scalar setters ----------------------------------------

def test_set_clock_rounding(clean_profile):
    result = execute_tool(
        "set_clock_rounding", {"minutes": 30},
    )
    assert result["ok"] is True
    assert _settings()["clocks"]["rounding_minutes"] == 30


def test_set_clock_rounding_rejects_negative(clean_profile):
    result = execute_tool(
        "set_clock_rounding", {"minutes": -5},
    )
    assert "error" in result


def test_set_backup_retention(clean_profile):
    result = execute_tool(
        "set_backup_retention", {"keep": 5},
    )
    assert result["ok"] is True
    assert _settings()["backup"]["keep"] == 5


def test_set_backup_retention_rejects_zero(clean_profile):
    result = execute_tool(
        "set_backup_retention", {"keep": 0},
    )
    assert "error" in result


def test_int_setters_reject_bool(clean_profile):
    """bool is an int subclass; True must not sneak through
    as 1 for a numeric setting."""
    assert "error" in execute_tool(
        "set_clock_rounding", {"minutes": True},
    )
    assert "error" in execute_tool(
        "set_backup_retention", {"keep": True},
    )


def test_set_timezone_valid(clean_profile):
    result = execute_tool(
        "set_timezone", {"timezone": "America/New_York"},
    )
    assert result["ok"] is True
    assert _settings()["timezone"] == "America/New_York"


def test_set_timezone_rejects_unknown(clean_profile):
    result = execute_tool(
        "set_timezone", {"timezone": "Mars/Olympus"},
    )
    assert "error" in result


# -- set_ai_model ------------------------------------------

def test_set_ai_model_sets_only_model_fields(clean_profile):
    result = execute_tool(
        "set_ai_model",
        {"advisor_model": "claude", "cron_model": "gemma"},
    )
    assert result["ok"] is True
    ai = _settings()["ai"]
    assert ai["advisor_model"] == "claude"
    assert ai["cron_model"] == "gemma"


def test_set_ai_model_requires_a_field(clean_profile):
    result = execute_tool("set_ai_model", {})
    assert "error" in result


def test_set_ai_model_rejects_empty_model(clean_profile):
    """An empty-after-strip model would silently break the
    next advisor/cron run."""
    result = execute_tool(
        "set_ai_model", {"advisor_model": "   "},
    )
    assert "error" in result
