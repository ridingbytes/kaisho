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


# -- _validate_job_id ---------------------------------------------

def test_validate_job_id_accepts_slug():
    from kaisho.cron.tools import _validate_job_id
    assert _validate_job_id("daily-briefing") is None
    assert _validate_job_id("a") is None
    assert _validate_job_id("hn-ai-daily-2") is None


def test_validate_job_id_rejects_path_traversal():
    """Path traversal attempts must be rejected so the
    template MCP tool can't write outside the prompts
    dir or jam slashes into jobs.yaml."""
    from kaisho.cron.tools import _validate_job_id
    bad = [
        "../etc/passwd",
        "../../foo",
        "/etc/passwd",
        "foo/bar",
        "foo\\bar",
        "foo bar",
        "Foo",
        "",
        "1" * 65,
        "-leading-dash",
        ".hidden",
        "with.dot",
    ]
    for case in bad:
        msg = _validate_job_id(case)
        assert msg is not None, (
            f"job_id {case!r} should be rejected"
        )


# -- cron_safe_tools ----------------------------------------------

def test_cron_safe_tools_excludes_destructive():
    """Defense-in-depth: cron must not be handed delete_*,
    execute_cli, or profile-management tools, since cron
    runs unattended and prompt-injection from fetched URLs
    is realistic."""
    from kaisho.cron.tools import cron_safe_tools
    safe_names = {
        t["function"]["name"] for t in cron_safe_tools()
    }
    forbidden = {
        "delete_task",
        "delete_clock_entry",
        "delete_note",
        "delete_customer",
        "delete_profile",
        "delete_skill",
        "rename_profile",
        "execute_cli",
        "approve_url_domain",
        "create_cron_from_template",
        "trigger_cron_job",
        "create_backup",
        "write_kb_file",
    }
    leaked = forbidden & safe_names
    assert not leaked, (
        f"destructive tool exposed to cron: {leaked}"
    )


def test_cron_safe_tools_includes_research():
    """fetch_url, transcribe_youtube, and web_search must
    remain available so weekly-scout-style research
    prompts keep working."""
    from kaisho.cron.tools import cron_safe_tools
    names = {
        t["function"]["name"] for t in cron_safe_tools()
    }
    needed = {
        "fetch_url",
        "transcribe_youtube",
        "web_search",
        "search_knowledge",
        "read_knowledge_file",
    }
    assert needed.issubset(names), (
        f"missing research tools: {needed - names}"
    )
