"""Smoke tests for the cron-template service."""
from kaisho.services.cron_templates import (
    get_cron_template,
    list_cron_templates,
)


def test_list_returns_known_templates():
    """Default templates ship with the codebase; the
    list endpoint must return at least these IDs."""
    templates = list_cron_templates()
    ids = {tpl["id"] for tpl in templates}
    expected = {
        "daily-briefing",
        "weekly-summary",
        "weekly-project-update",
        "hn-ai-daily",
        "weekly-scout",
    }
    assert expected.issubset(ids)


def test_template_metadata_shape():
    """Every template must expose metadata + a non-empty
    prompt body so the picker can render it."""
    for tpl in list_cron_templates():
        for key in (
            "id", "name", "description", "category",
            "requires_tools", "default_schedule",
            "default_model", "default_output",
            "default_timeout", "prompt_file", "prompt",
        ):
            assert key in tpl, f"missing {key}"
        assert tpl["prompt"], (
            f"empty prompt body: {tpl['id']}"
        )


def test_requires_tools_flag_set_on_research_template():
    """weekly-scout is the canonical tool-using template;
    its requires_tools flag must be true so the picker
    can warn about Gemma."""
    tpl = get_cron_template("weekly-scout")
    assert tpl is not None
    assert tpl["requires_tools"] is True


def test_get_unknown_template_returns_none():
    assert get_cron_template("does-not-exist") is None
