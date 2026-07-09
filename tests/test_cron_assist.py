"""Tests for the cron prompt assistant service."""
from kaisho.services import cron_assist


def test_strip_fences_removes_wrapping_block():
    assert cron_assist._strip_fences(
        "```markdown\nHello world\n```"
    ) == "Hello world"
    assert cron_assist._strip_fences("```\nHi\n```") == "Hi"


def test_strip_fences_leaves_unfenced_text():
    text = "Just a prompt\nwith two lines"
    assert cron_assist._strip_fences(text) == text


def test_build_user_includes_prompt_and_instruction():
    out = cron_assist._build_user("make it short", "OLD BODY")
    assert "OLD BODY" in out
    assert "make it short" in out


def test_rewrite_dispatches_to_ollama(monkeypatch):
    seen = {}

    def fake(model, system, user, base_url, api_key=""):
        seen["model"] = model
        seen["base_url"] = base_url
        return "NEW PROMPT"

    monkeypatch.setattr(cron_assist, "_complete_ollama", fake)
    out = cron_assist.rewrite_cron_prompt(
        "make it short", "OLD", "ollama:qwen3:14b",
        ollama_base_url="http://x:11434",
    )
    assert out == "NEW PROMPT"
    assert seen["model"] == "qwen3:14b"
    assert seen["base_url"] == "http://x:11434"


def test_rewrite_defaults_to_ollama_without_prefix(monkeypatch):
    monkeypatch.setattr(
        cron_assist, "_complete_ollama",
        lambda *a, **k: "X",
    )
    assert cron_assist.rewrite_cron_prompt(
        "i", "p", "gemma3",
    ) == "X"


def test_rewrite_dispatches_to_claude(monkeypatch):
    monkeypatch.setattr(
        cron_assist, "_complete_claude",
        lambda *a, **k: "CLAUDE OUT",
    )
    out = cron_assist.rewrite_cron_prompt(
        "x", "y", "claude:claude-sonnet-4",
        claude_api_key="k",
    )
    assert out == "CLAUDE OUT"
