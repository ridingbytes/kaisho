"""Regression guard for the summarize -> cloud_ai_agentic
call site.

The bug: ``_ask_kaisho_cloud`` was calling
``cloud_ai_agentic`` with kwargs named ``system_prompt`` and
``tool_handlers``, but the function signature uses ``system``
and ``tool_executor``. That raised ``TypeError`` at runtime
the first time a user with a Kaisho-cloud model configured
tried to summarize a KB file.

A unit test guards the kwarg names explicitly so a future
rename of either function gets caught at the boundary.
"""
import inspect

from kaisho.services import cloud_sync
from kaisho.services import summarize


def test_ask_kaisho_cloud_kwargs_match_cloud_ai_agentic(
    monkeypatch,
):
    """Capture the kwargs the summarize caller passes and
    assert they all appear in ``cloud_ai_agentic``'s real
    signature. Equivalent to letting CPython's argument
    binding catch the mismatch at call time, but without
    actually hitting the network.
    """
    # Snapshot the real signature BEFORE we monkeypatch
    # the function out, otherwise inspect.signature would
    # read the fake's ``(*args, **kwargs)`` shape.
    real_sig = inspect.signature(cloud_sync.cloud_ai_agentic)
    accepted = set(real_sig.parameters)

    captured: dict = {}

    def fake(*args, **kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr(
        cloud_sync, "cloud_ai_agentic", fake,
    )

    summarize._ask_kaisho_cloud(
        model_name="default",
        prompt="hi",
        cloud_url="http://example",
        cloud_api_key="k",
    )

    unknown = set(captured) - accepted
    assert not unknown, (
        f"summarize.py passes kwargs that "
        f"cloud_ai_agentic does not accept: {sorted(unknown)}"
    )
