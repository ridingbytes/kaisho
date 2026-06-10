"""``_get_done_states`` reads the ``done: true`` flag
from ``settings.yaml`` so the user can pick which states
count as completed.

Before, the helper hardcoded ``{"DONE", "CANCELLED"}``,
which meant the badge in Settings was decoration and the
tick icon silently moved tasks into a state that may not
exist.
"""
from unittest.mock import patch

from kaisho.services.kanban import _get_done_states


def _fake_settings(states):
    return {"task_states": states}


def test_uses_done_flag_from_settings():
    """A state flagged ``done: true`` is treated as
    completed; one without the flag is not."""
    settings = _fake_settings([
        {"name": "TODO", "done": False},
        {"name": "WAIT"},
        {"name": "ARCHIVED", "done": True},
    ])
    with patch(
        "kaisho.config.load_settings_yaml",
        return_value=settings,
    ):
        result = _get_done_states(
            {"TODO", "WAIT", "ARCHIVED"},
        )
    assert result == {"ARCHIVED"}


def test_falls_back_when_no_state_flagged():
    """Existing profiles whose settings predate the
    flag should keep the historical
    ``{DONE, CANCELLED}`` behaviour rather than suddenly
    have nothing marked completed."""
    settings = _fake_settings([
        {"name": "TODO"}, {"name": "DONE"},
        {"name": "CANCELLED"},
    ])
    with patch(
        "kaisho.config.load_settings_yaml",
        return_value=settings,
    ):
        result = _get_done_states(
            {"TODO", "DONE", "CANCELLED"},
        )
    assert result == {"DONE", "CANCELLED"}


def test_intersects_with_keywords():
    """A stale ``done: true`` for a state that was later
    deleted (and is no longer in the parser keyword set)
    must not surface as a phantom done-state."""
    settings = _fake_settings([
        {"name": "TODO", "done": False},
        {"name": "GHOST", "done": True},
        {"name": "ARCHIVED", "done": True},
    ])
    with patch(
        "kaisho.config.load_settings_yaml",
        return_value=settings,
    ):
        result = _get_done_states({"TODO", "ARCHIVED"})
    assert result == {"ARCHIVED"}


def test_falls_back_on_missing_settings_file():
    """Test setups that don't ship a ``settings.yaml``
    (existing backend-parity tests rely on this) must
    not crash. Empty / missing settings drops through
    to the legacy hardcoded set."""
    def _raise(*_a, **_kw):
        raise FileNotFoundError("no settings.yaml in test")

    with patch(
        "kaisho.config.load_settings_yaml",
        _raise,
    ):
        result = _get_done_states(
            {"TODO", "DONE", "CANCELLED"},
        )
    assert result == {"DONE", "CANCELLED"}
