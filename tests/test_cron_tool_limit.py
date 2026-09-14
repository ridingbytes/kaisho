"""What a cron job writes when it exhausts its tool budget.

Nobody watches a cron run. Whatever the loop returns goes
straight into the inbox under the job's name, so an empty
string or a tool result becomes a briefing that is blank or
is raw JSON, with nothing to say why.
"""
import json

import pytest

from kaisho.cron import executor


@pytest.fixture(autouse=True)
def stub_tools(monkeypatch):
    monkeypatch.setattr(
        executor, "cron_safe_tools", lambda: [],
    )
    monkeypatch.setattr(
        executor, "_execute_tool_calls",
        lambda calls, include_id=False: [
            {"role": "tool", "content": '{"rows":[1,2,3]}'}
        ],
    )


def _tool_call(i):
    return {
        "id": f"c{i}",
        "type": "function",
        "function": {
            "name": "list_tasks", "arguments": json.dumps({}),
        },
    }


def test_ollama_reports_the_limit(monkeypatch):
    calls = {"n": 0}

    def wants_tools_forever(url, payload, headers, timeout=0):
        calls["n"] += 1
        return {"message": {
            "role": "assistant", "content": "",
            "tool_calls": [_tool_call(calls["n"])],
        }}

    monkeypatch.setattr(
        executor, "_http_post", wants_tools_forever,
    )
    out = executor.run_prompt_ollama(
        "qwen3:14b", "Briefing", "http://localhost:11434",
    )
    assert calls["n"] == executor.MAX_TOOL_ITERATIONS
    assert out == executor.TOOL_LIMIT_OUTPUT
    # Not the tool result, and not empty.
    assert "rows" not in out
    assert out.strip()


def test_openai_reports_the_limit(monkeypatch):
    calls = {"n": 0}

    def wants_tools_forever(url, payload, headers, timeout=0):
        calls["n"] += 1
        return {"choices": [{"message": {
            "role": "assistant", "content": "",
            "tool_calls": [_tool_call(calls["n"])],
        }}]}

    monkeypatch.setattr(
        executor, "_http_post", wants_tools_forever,
    )
    out = executor.run_prompt_openai_compatible(
        "gpt-4o", "Briefing", "https://api.example/v1", "k",
    )
    assert calls["n"] == executor.MAX_TOOL_ITERATIONS
    assert out == executor.TOOL_LIMIT_OUTPUT


def test_the_message_names_the_limit_and_what_to_do():
    """A cron user reads this in their inbox hours later,
    with no other context."""
    out = executor.TOOL_LIMIT_OUTPUT
    assert str(executor.MAX_TOOL_ITERATIONS) in out
    assert "narrow" in out or "splitting" in out


def test_a_normal_run_is_unaffected(monkeypatch):
    def answers(url, payload, headers, timeout=0):
        return {"message": {
            "role": "assistant",
            "content": "Heute stehen 3 Aufgaben an.",
        }}

    monkeypatch.setattr(executor, "_http_post", answers)
    out = executor.run_prompt_ollama(
        "qwen3:14b", "Briefing", "http://localhost:11434",
    )
    assert out == "Heute stehen 3 Aufgaben an."
