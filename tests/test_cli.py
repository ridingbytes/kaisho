"""CLI smoke tests using Click's test runner."""
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from omnicontrol.cli.main import cli


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def mock_config(tmp_path):
    """Patch get_config to use temp paths."""
    db = tmp_path / "test.db"
    jobs = tmp_path / "jobs.yaml"
    org = tmp_path / "org"
    org.mkdir()
    (org / "todos.org").write_text("", encoding="utf-8")
    (org / "clocks.org").write_text("", encoding="utf-8")
    (org / "kunden.org").write_text("", encoding="utf-8")
    (org / "inbox.org").write_text("", encoding="utf-8")
    (org / "archive.org").write_text("", encoding="utf-8")

    class FakeCfg:
        DB_FILE = db
        JOBS_FILE = jobs
        TODOS_FILE = org / "todos.org"
        CLOCKS_FILE = org / "clocks.org"
        KUNDEN_FILE = org / "kunden.org"
        INBOX_FILE = org / "inbox.org"
        ARCHIVE_FILE = org / "archive.org"
        WISSEN_DIR = tmp_path / "wissen"
        RESEARCH_DIR = tmp_path / "research"
        OLLAMA_BASE_URL = "http://localhost:11434"
        SETTINGS_FILE = tmp_path / "settings.yaml"

    FakeCfg.WISSEN_DIR.mkdir()
    FakeCfg.RESEARCH_DIR.mkdir()
    return FakeCfg()


def test_cli_help(runner):
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "OmniControl" in result.output


def test_cron_list_empty(runner, mock_config):
    with patch("omnicontrol.cli.cron.get_config", return_value=mock_config):
        result = runner.invoke(cli, ["cron", "list"])
    assert result.exit_code == 0
    assert "No jobs" in result.output


def test_cron_add_and_list(runner, mock_config):
    with patch("omnicontrol.cli.cron.get_config", return_value=mock_config):
        add_result = runner.invoke(cli, [
            "cron", "add", "my-job", "My Job",
            "--schedule", "0 9 * * 1",
            "--prompt-file", "prompts/test.md",
            "--output", "inbox",
        ])
        assert add_result.exit_code == 0

        list_result = runner.invoke(cli, ["cron", "list"])
        assert "my-job" in list_result.output


def test_comm_add_and_list(runner, mock_config):
    with patch("omnicontrol.cli.comm.get_config", return_value=mock_config):
        add_result = runner.invoke(cli, [
            "comm", "add", "Test email",
            "--direction", "in",
            "--channel", "email",
        ])
        assert add_result.exit_code == 0
        assert "Logged" in add_result.output

        list_result = runner.invoke(cli, ["comm", "list"])
        assert "Test email" in list_result.output


def test_comm_search(runner, mock_config):
    with patch("omnicontrol.cli.comm.get_config", return_value=mock_config):
        runner.invoke(cli, [
            "comm", "add", "Budget discussion",
            "--direction", "out",
        ])
        result = runner.invoke(cli, ["comm", "search", "Budget"])
        assert result.exit_code == 0
        assert "Budget" in result.output
