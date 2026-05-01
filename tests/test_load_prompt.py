"""Tests for cron executor's prompt loader.

Regression target: a job referencing a ``~``-prefixed
prompt path (e.g. ``~/.kaisho/profiles/<p>/prompts/x.md``)
would resolve incorrectly because Path's
``is_absolute()`` is False on ``~/...`` and the loader
joined onto project_root before expanding ``~``,
producing ``<runtime>/_internal/~/.kaisho/...``.
"""
from pathlib import Path

from kaisho.cron.executor import load_prompt


def test_load_prompt_expands_tilde(tmp_path,
                                   monkeypatch):
    """A ``~/...`` prompt_file resolves against $HOME,
    not project_root."""
    fake_home = tmp_path / "fake-home"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))

    prompts_dir = fake_home / ".kaisho/prompts"
    prompts_dir.mkdir(parents=True)
    prompt_path = prompts_dir / "test.md"
    prompt_path.write_text(
        "expanded ok", encoding="utf-8",
    )

    project_root = tmp_path / "runtime/_internal"
    project_root.mkdir(parents=True)

    result = load_prompt(
        "~/.kaisho/prompts/test.md",
        project_root,
    )
    assert "expanded ok" in result


def test_load_prompt_resolves_relative_to_project_root(
    tmp_path,
):
    """Plain relative paths like ``prompts/foo.md`` keep
    resolving against project_root (template behaviour)."""
    project_root = tmp_path
    (project_root / "prompts").mkdir()
    (project_root / "prompts/foo.md").write_text(
        "rel ok", encoding="utf-8",
    )

    result = load_prompt("prompts/foo.md", project_root)
    assert "rel ok" in result


def test_load_prompt_absolute_path_unchanged(tmp_path):
    """An absolute path is used verbatim — no joining."""
    p = tmp_path / "absolute.md"
    p.write_text("abs ok", encoding="utf-8")

    result = load_prompt(str(p), Path("/nonexistent"))
    assert "abs ok" in result
