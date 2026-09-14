"""What the advisor says when it runs out of turns.

The agentic loop is capped at _MAX_TURNS. A model that
keeps asking for tools until the cap is reached has not
answered, and the three provider paths each handled that
differently and none of them well: Claude returned "" and
the user saw nothing, while Ollama and OpenAI returned
messages[-1], which at that point is a tool result -- raw
JSON presented as the answer.
"""
import json

import pytest

from kaisho.services import advisor


@pytest.fixture(autouse=True)
def no_tool_side_effects(monkeypatch):
    """Tools always succeed and return something JSON-ish,
    so the loop keeps going for the cap rather than
    stopping on an error."""
    monkeypatch.setattr(
        advisor, "execute_tool",
        lambda name, args: {"rows": [1, 2, 3]},
    )
    monkeypatch.setattr(
        advisor, "advisor_safe_tool_defs", lambda: [],
    )
    monkeypatch.setattr(
        advisor, "advisor_safe_tools", lambda: [],
    )


def _tool_call(index):
    return {
        "id": f"call-{index}",
        "type": "function",
        "function": {
            "name": "list_tasks",
            "arguments": json.dumps({}),
        },
    }


def test_ollama_says_so_instead_of_returning_a_tool_result(
    monkeypatch,
):
    calls = {"n": 0}

    def always_wants_tools(url, payload, headers, timeout=0):
        calls["n"] += 1
        return {
            "message": {
                "role": "assistant",
                "content": "",
                "tool_calls": [_tool_call(calls["n"])],
            }
        }

    monkeypatch.setattr(
        advisor, "_http_post", always_wants_tools,
    )
    out = advisor.ask_ollama(
        "qwen3:14b", "Was habe ich gemacht?",
        "http://localhost:11434",
    )
    assert calls["n"] == advisor._MAX_TURNS
    assert out == advisor._TURN_LIMIT_REPLY
    # The old return value was the last tool result.
    assert "rows" not in out


def test_openai_compatible_says_so(monkeypatch):
    calls = {"n": 0}

    def always_wants_tools(url, payload, headers, timeout=0):
        calls["n"] += 1
        return {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [_tool_call(calls["n"])],
                }
            }]
        }

    monkeypatch.setattr(
        advisor, "_http_post", always_wants_tools,
    )
    out = advisor.ask_openai_compatible(
        "gpt-4o", "Was habe ich gemacht?",
        "https://api.example/v1", "key",
    )
    assert calls["n"] == advisor._MAX_TURNS
    assert out == advisor._TURN_LIMIT_REPLY


def test_the_reply_is_an_answer_not_an_empty_string():
    """The Claude path returned "", which the UI renders as
    a blank response to a question the user asked."""
    assert advisor._TURN_LIMIT_REPLY.strip()
    assert len(advisor._TURN_LIMIT_REPLY) > 20


def test_a_normal_answer_is_unaffected(monkeypatch):
    """The cap must not change the ordinary path."""
    def answers_once(url, payload, headers, timeout=0):
        return {
            "message": {
                "role": "assistant",
                "content": "Du hast 3 Stunden gebucht.",
            }
        }

    monkeypatch.setattr(
        advisor, "_http_post", answers_once,
    )
    out = advisor.ask_ollama(
        "qwen3:14b", "Wieviel?", "http://localhost:11434",
    )
    assert out == "Du hast 3 Stunden gebucht."
