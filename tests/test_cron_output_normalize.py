"""Tests for ``_normalize_model_output``.

When a model returns its content JSON-escaped (``\\n``
literals where a real newline was meant), the inbox /
Markdown renderer cannot turn the escapes back into line
breaks and the user sees one long line. We unescape
defensively only when the heuristic is unambiguous.
"""
from kaisho.cron.executor import _normalize_model_output


def test_real_newlines_passthrough():
    """Output that already has real newlines stays
    untouched — even if it also contains a stray ``\\n``
    inside a code sample."""
    text = "line one\nline two\nliteral \\n inside"
    assert _normalize_model_output(text) == text


def test_no_escapes_passthrough():
    """Plain single-line output without ``\\n`` literals
    is left alone."""
    text = "Just one line."
    assert _normalize_model_output(text) == text


def test_decodes_json_escaped_output():
    """Single-line output peppered with ``\\n``,
    ``\\t`` and ``\\\"`` is treated as JSON-escaped and
    decoded back to readable text."""
    raw = (
        'Tagesrückblick vom 01.05.2026\\n\\n'
        '📝 Heute geleistet:\\n'
        '- RIDING BYTES: \\"Morning Routine\\" (2h).\\n'
        '\\tTab-indented bullet'
    )
    out = _normalize_model_output(raw)
    assert "\\n" not in out
    assert '\\"' not in out
    assert "\\t" not in out
    assert "📝" in out  # utf-8 multibyte intact
    assert "ü" in out
    assert out.split("\n")[0] == (
        "Tagesrückblick vom 01.05.2026"
    )
    assert '"Morning Routine"' in out
    assert "\tTab-indented bullet" in out
