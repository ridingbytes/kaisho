"""Tests for the advisor's cron-authoring tools:
``get_cron_job``, ``update_cron_prompt``, and the custom
``prompt`` override on ``create_cron_from_template``.

These let the advisor read a job's prompt, tailor it to the
user, and reject typo'd placeholders before they silently
render as literal tokens at run time.
"""
import pytest

from kaisho.cron.tools import advisor_safe_tool_defs, execute_tool


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


def _create(job_id="my-brief", **kw):
    args = {
        "template_id": "daily-briefing",
        "job_id": job_id,
    }
    args.update(kw)
    return execute_tool("create_cron_from_template", args)


def test_advisor_has_cron_authoring_tools():
    names = {t["name"] for t in advisor_safe_tool_defs()}
    assert "get_cron_job" in names
    assert "update_cron_prompt" in names


def test_get_cron_job_returns_prompt_and_placeholders(
    clean_profile,
):
    _create(prompt="Hi ${user.name}, on ${date}: brief me.")
    result = execute_tool("get_cron_job", {"job_id": "my-brief"})
    assert "error" not in result
    assert result["job"]["id"] == "my-brief"
    assert "brief me" in result["prompt"]
    assert set(result["placeholders"]["used"]) == {
        "user.name", "date",
    }
    assert result["placeholders"]["unknown"] == []


def test_get_cron_job_not_found(clean_profile):
    result = execute_tool("get_cron_job", {"job_id": "nope"})
    assert "error" in result
    assert "not found" in result["error"].lower()


def test_create_with_custom_prompt(clean_profile):
    result = _create(prompt="Custom body for ${user.company}.")
    assert result.get("ok") is True
    got = execute_tool("get_cron_job", {"job_id": "my-brief"})
    assert got["prompt"] == "Custom body for ${user.company}."


def test_create_rejects_unknown_placeholder(clean_profile):
    result = _create(prompt="Broken ${user.compny}.")
    assert "error" in result
    assert "user.compny" in result["error"]
    # The job must not have been created.
    got = execute_tool("get_cron_job", {"job_id": "my-brief"})
    assert "error" in got


def test_update_cron_prompt_replaces_body(clean_profile):
    _create(prompt="Original ${date}.")
    upd = execute_tool(
        "update_cron_prompt",
        {
            "job_id": "my-brief",
            "prompt": "Revised for ${user.name}.",
        },
    )
    assert upd.get("ok") is True
    got = execute_tool("get_cron_job", {"job_id": "my-brief"})
    assert got["prompt"] == "Revised for ${user.name}."


def test_update_cron_prompt_rejects_unknown_placeholder(
    clean_profile,
):
    _create(prompt="Original ${date}.")
    upd = execute_tool(
        "update_cron_prompt",
        {
            "job_id": "my-brief",
            "prompt": "Oops ${user.nam}.",
        },
    )
    assert "error" in upd
    assert "user.nam" in upd["error"]
    # Original prompt is untouched.
    got = execute_tool("get_cron_job", {"job_id": "my-brief"})
    assert got["prompt"] == "Original ${date}."


def test_update_cron_prompt_not_found(clean_profile):
    upd = execute_tool(
        "update_cron_prompt",
        {"job_id": "ghost", "prompt": "hi"},
    )
    assert "error" in upd
    assert "not found" in upd["error"].lower()


def test_escaped_placeholder_is_allowed(clean_profile):
    """A literal ``\\${...}`` must not trip the unknown-
    placeholder guard."""
    result = _create(
        prompt="Use \\${literal} verbatim, ${user.name}.",
    )
    assert result.get("ok") is True
