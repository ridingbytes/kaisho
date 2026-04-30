"""Regression tests for cron cloud-credential plumbing.

Twice now the same copy-paste bug shipped: ``ollama_api_key``
passed where ``ollama_cloud_api_key`` was expected, and the
cloud_url/cloud_api_key omitted entirely on the
manual-trigger path. Both were silent — neither broke
imports or existing tests.

These tests assert that ALL invocations of ``execute_job``
forward both pairs of cloud creds correctly. If a future
patch drops one again, the tests fail loudly.
"""
from unittest.mock import patch


def _ai_settings_fixture():
    return {
        "ollama_url": "http://ollama-host:11434",
        "ollama_api_key": "OLLAMA_LOCAL_KEY",
        "ollama_cloud_url": "https://cloud.ollama",
        "ollama_cloud_api_key": "OLLAMA_CLOUD_KEY",
        "lm_studio_url": "http://lmstudio:1234",
        "claude_api_key": "CLAUDE_KEY",
        "openrouter_url": "https://openrouter.ai/api/v1",
        "openrouter_api_key": "OPENROUTER_KEY",
        "openai_url": "https://api.openai.com/v1",
        "openai_api_key": "OPENAI_KEY",
    }


def _settings_fixture():
    return {
        "ai": _ai_settings_fixture(),
        "cloud_sync": {
            "enabled": True,
            "url": "https://cloud.kaisho.dev",
            "api_key": "CLOUD_KEY",
        },
    }


def test_scheduler_forwards_all_cloud_creds(tmp_path):
    """The APScheduler-fired path must forward both cloud
    api keys correctly."""
    from kaisho.cron import scheduler

    job = {
        "id": "test-job",
        "model": "ollama_cloud:gemma3:27b",
        "prompt_file": "prompts/daily-briefing.md",
        "schedule": "0 0 * * *",
        "timeout": 60,
    }

    captured = {}

    def fake_execute_job(job_arg, **kwargs):
        captured.update(kwargs)
        return "ok"

    cfg_stub = type(
        "Cfg", (),
        {
            "PROFILE_DIR": tmp_path,
            "SETTINGS_FILE": tmp_path / "settings.yaml",
        },
    )()

    with patch.object(
        scheduler, "execute_job", fake_execute_job,
    ), patch.object(
        scheduler, "get_config", return_value=cfg_stub,
    ), patch.object(
        scheduler, "start_run", return_value=1,
    ), patch.object(
        scheduler, "finish_run", return_value=None,
    ), patch(
        "kaisho.services.settings.load_settings",
        return_value=_settings_fixture(),
    ), patch(
        "kaisho.services.settings.get_ai_settings",
        return_value=_ai_settings_fixture(),
    ), patch(
        "kaisho.services.settings.get_cloud_sync_key",
        return_value="CLOUD_KEY",
    ):
        scheduler._run_job(job)

    assert captured["ollama_api_key"] == "OLLAMA_LOCAL_KEY"
    assert captured["ollama_cloud_api_key"] == (
        "OLLAMA_CLOUD_KEY"
    )
    assert (
        captured["cloud_url"] == "https://cloud.kaisho.dev"
    )
    assert captured["cloud_api_key"] == "CLOUD_KEY"


def test_trigger_cron_job_forwards_all_cloud_creds(
    tmp_path,
):
    """The advisor's trigger_cron_job MCP tool must
    forward both cloud api keys correctly."""
    from kaisho.cron import tools as cron_tools

    job = {
        "id": "test-job",
        "model": "kaisho:cron",
        "prompt_file": "prompts/daily-briefing.md",
        "schedule": "0 0 * * *",
        "timeout": 60,
    }

    cfg_stub = type(
        "Cfg", (),
        {
            "PROFILE_DIR": tmp_path,
            "SETTINGS_FILE": tmp_path / "settings.yaml",
            "JOBS_FILE": tmp_path / "jobs.yaml",
        },
    )()

    captured = {}

    def fake_execute_job(job_arg, **kwargs):
        captured.update(kwargs)
        return "ok"

    class FakeThread:
        def __init__(self, target, daemon=False):
            self._target = target

        def start(self):
            self._target()

    with patch(
        "kaisho.services.cron.get_job",
        return_value=job,
    ), patch(
        "kaisho.services.cron.start_run",
        return_value=1,
    ), patch(
        "kaisho.services.cron.finish_run",
        return_value=None,
    ), patch(
        "kaisho.config.get_config",
        return_value=cfg_stub,
    ), patch(
        "kaisho.services.settings.load_settings",
        return_value=_settings_fixture(),
    ), patch(
        "kaisho.services.settings.get_ai_settings",
        return_value=_ai_settings_fixture(),
    ), patch(
        "kaisho.services.settings.get_cloud_sync_key",
        return_value="CLOUD_KEY",
    ), patch(
        "kaisho.cron.executor.execute_job",
        fake_execute_job,
    ), patch(
        "threading.Thread", FakeThread,
    ):
        cron_tools._trigger_cron_job("test-job")

    assert captured["ollama_api_key"] == "OLLAMA_LOCAL_KEY"
    assert captured["ollama_cloud_api_key"] == (
        "OLLAMA_CLOUD_KEY"
    )
    assert (
        captured["cloud_url"] == "https://cloud.kaisho.dev"
    )
    assert captured["cloud_api_key"] == "CLOUD_KEY"
