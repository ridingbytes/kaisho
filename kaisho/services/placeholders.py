"""Prompt placeholder substitution.

Cron prompts and advisor templates use ``${...}``
placeholders that get substituted at load time. The
syntax is shell-like and intentionally distinct from
literal curly braces (which appear in JSON examples,
regex, etc.) so naked ``{`` doesn't collide.

Two namespaces:

- ``${user.<field>}`` — values from the active profile's
  ``user.yaml`` (name, email, bio, company, industry,
  research_targets).
- ``${date}`` — today's ISO date.
- ``${fetch_results}`` — the result of pre-fetching the
  URLs declared in the prompt's ``fetch:`` frontmatter.

Substitution is opt-out: a prompt that doesn't include
any placeholders is returned unchanged.

Validation: after substitution, any remaining
``${...}`` token is logged as a warning. Stale tokens
also produce diagnostics for the editor save path.
"""
from __future__ import annotations

import logging
import re
from datetime import date as _date

log = logging.getLogger(__name__)


# ``${...}`` excluding escaped ``\${...}``. The
# negative-lookbehind keeps escape semantics: a literal
# ``\${user.foo}`` in prose passes through untouched
# (the backslash is stripped at the end).
#
# The token body excludes ``}`` and ``\n`` so a malformed
# ``${user.name`` (missing close brace) cannot greedily
# swallow content up to a matching brace many lines down.
# Multi-line tokens are not a feature we want to support.
_PLACEHOLDER_RE = re.compile(r"(?<!\\)\$\{([^}\n]+)\}")
_ESCAPED_RE = re.compile(r"\\\$\{")

# Canonical, ordered list of valid ``user.*`` placeholder
# fields. This is the SINGLE SOURCE OF TRUTH — config.py
# builds the user.yaml template from it, tools.py iterates
# the string fields from it, and the API surfaces it to
# the frontend so the editor highlighter cannot drift.
USER_FIELDS: tuple[str, ...] = (
    "name", "email", "bio",
    "company", "industry", "research_targets",
)

# Frozen set for fast membership checks. Derived — do not
# edit directly.
_USER_FIELD_SET = frozenset(USER_FIELDS)

# Top-level placeholders (no namespace).
SYSTEM_FIELDS: tuple[str, ...] = ("date", "fetch_results")
_SYSTEM_FIELD_SET = frozenset(SYSTEM_FIELDS)


def render_placeholders(
    body: str,
    user: dict | None = None,
    date_iso: str | None = None,
    fetch_results: str | None = None,
) -> tuple[str, list[str]]:
    """Substitute ``${...}`` placeholders in ``body``.

    Returns the rendered body and a list of unresolved
    placeholder names (each entry like ``user.compny``)
    so callers can surface diagnostics.

    :param body: Prompt source.
    :param user: ``user.yaml`` dict; missing fields render
        as empty string.
    :param date_iso: Override for ``${date}``; defaults
        to today.
    :param fetch_results: Result of frontmatter URL
        fetching; substitutes ``${fetch_results}`` only
        when supplied.
    :returns: ``(rendered_body, unresolved_names)``.
    """
    user = user or {}
    if date_iso is None:
        date_iso = _date.today().isoformat()

    unresolved: list[str] = []

    def resolve(match: re.Match[str]) -> str:
        name = match.group(1).strip()
        value = _resolve_one(
            name, user, date_iso, fetch_results,
        )
        if value is None:
            unresolved.append(name)
            return match.group(0)
        return value

    rendered = _PLACEHOLDER_RE.sub(resolve, body)
    # Strip the escape backslash now that substitution is
    # done — ``\${user.foo}`` in source becomes literal
    # ``${user.foo}`` in output.
    rendered = _ESCAPED_RE.sub("${", rendered)
    return rendered, unresolved


def _resolve_one(
    name: str,
    user: dict,
    date_iso: str,
    fetch_results: str | None,
) -> str | None:
    """Look up a single placeholder name.

    Return values:
    - ``str`` for any *known* placeholder. Missing data
      (e.g. ``user.bio`` when bio is empty) renders as
      ``""`` so the surrounding prose still flows.
    - ``None`` for an *unknown* placeholder (typo, removed
      field). The caller leaves the literal token in
      place and reports it via the unresolved list so the
      editor can flag the mistake.
    """
    if name == "date":
        return date_iso
    if name == "fetch_results":
        return fetch_results if fetch_results else ""
    if name.startswith("user."):
        field = name[len("user."):]
        if field not in _USER_FIELD_SET:
            return None
        value = user.get(field, "")
        if isinstance(value, list):
            return _format_list(value)
        return str(value or "")
    return None


def _format_list(values: list) -> str:
    """Render a list of strings as a markdown bullet list
    so the model sees structured data, not a comma-joined
    blob. Empty list renders as an empty string so the
    surrounding prompt prose still flows."""
    items = [str(v).strip() for v in values if str(v).strip()]
    if not items:
        return ""
    return "\n".join(f"- {item}" for item in items)


def find_placeholders(body: str) -> set[str]:
    """Return the set of placeholder names mentioned in
    ``body``. Used by editor validation to highlight
    known vs. unknown tokens before saving."""
    return {
        m.group(1).strip()
        for m in _PLACEHOLDER_RE.finditer(body)
    }


def is_known_placeholder(name: str) -> bool:
    """Return True if ``name`` is a recognised
    placeholder. Used by the editor highlighter.

    Trims surrounding whitespace to match the contract
    of ``find_placeholders`` and the editor's highlighter,
    which both strip whitespace before lookup.
    """
    name = name.strip()
    if name in _SYSTEM_FIELD_SET:
        return True
    if name.startswith("user."):
        return name[len("user."):] in _USER_FIELD_SET
    return False
