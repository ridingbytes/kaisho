"""Knowledge-base YAML frontmatter parser and writer.

The canonical schema is intentionally small. Required keys are
``title`` and ``tags`` (a possibly-empty list of free-text
strings). Optional keys: ``created`` (ISO date), ``customer``,
``task_id``, ``type``, ``status``.

The body below the closing ``---`` delimiter is preserved
verbatim by the round-trip helpers, so the editor can rewrite
frontmatter without touching the markdown the user wrote.

Example::

    ---
    title: Ansible Infrastructure
    tags: [ansible, it-admin]
    created: 2026-03-09
    customer: ACME
    ---

    # Ansible Infrastructure
    ...
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import yaml

# Order matters for ``serialize`` -- the keys come out in the
# same order they appear here. Keep ``title``/``tags`` first.
CANONICAL_KEYS: tuple[str, ...] = (
    "title",
    "tags",
    "created",
    "customer",
    "task_id",
    "type",
    "status",
)

OPTIONAL_KEYS: frozenset[str] = frozenset(
    {"created", "customer", "task_id", "type", "status"},
)

# Frontmatter is delimited by ``---`` lines. The opening
# delimiter must be the very first line of the file (no
# leading whitespace), matching the convention used by Jekyll,
# Hugo, Pandoc, and the Obsidian/Logseq KB tools.
_DELIM_RE = re.compile(
    r"\A---[ \t]*\n(.*?\n)---[ \t]*(?:\n|$)", re.S,
)

# Legacy keys we want to silently rename when reading. Keeps
# files written by the older inbox-move flow round-trippable.
_LEGACY_KEY_MAP: dict[str, str] = {
    "date": "created",
}


@dataclass
class Frontmatter:
    """Parsed view of a KB file's frontmatter and body.

    ``raw`` keeps the original frontmatter text so callers can
    detect whether the file had any frontmatter at all (an empty
    string means it did not).
    """

    title: str = ""
    tags: list[str] = field(default_factory=list)
    created: str | None = None
    customer: str | None = None
    task_id: str | None = None
    type: str | None = None
    status: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)
    body: str = ""
    raw: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Return a dict with the canonical keys that are set.

        ``tags`` is always present (possibly empty); other
        optional keys are only included when non-None and
        non-empty.
        """
        out: dict[str, Any] = {
            "title": self.title,
            "tags": list(self.tags),
        }
        for key in OPTIONAL_KEYS:
            value = getattr(self, key)
            if value:
                out[key] = value
        if self.extra:
            out["extra"] = dict(self.extra)
        return out


def parse(text: str) -> Frontmatter:
    """Parse a markdown file's frontmatter and body.

    Returns a ``Frontmatter`` with ``raw == ""`` when no
    frontmatter delimiters are present. Malformed YAML inside
    the delimiters is treated as an empty frontmatter (we do
    not raise -- the file is still readable).
    """
    match = _DELIM_RE.match(text)
    if match is None:
        return Frontmatter(body=text)
    raw = match.group(1)
    body = text[match.end():]
    data = _load_yaml(raw)
    return _from_dict(data, body=body, raw=raw)


def serialize(fm: Frontmatter) -> str:
    """Serialize a ``Frontmatter`` back to a markdown string.

    The canonical key order is preserved. Optional keys are
    omitted when empty; ``tags`` is always written (as a flow
    list). The body is appended unchanged, with exactly one
    blank line between the closing ``---`` and the body.
    """
    payload: dict[str, Any] = {}
    for key in CANONICAL_KEYS:
        value = getattr(fm, key)
        if key == "title":
            payload["title"] = value or ""
            continue
        if key == "tags":
            payload["tags"] = list(fm.tags)
            continue
        if not value:
            continue
        if key == "created":
            payload[key] = _as_date(value)
        else:
            payload[key] = value
    payload.update(fm.extra)
    yaml_text = yaml.safe_dump(
        payload,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    yaml_text = _flow_format_tags(yaml_text)
    body = fm.body.lstrip("\n")
    return f"---\n{yaml_text}---\n\n{body}" if body \
        else f"---\n{yaml_text}---\n"


def update(text: str, patch: dict[str, Any]) -> str:
    """Apply ``patch`` to a file's frontmatter and re-serialize.

    Keys present in ``patch`` overwrite existing values; keys
    set to ``None`` are removed. Unknown keys are stored in
    ``extra`` and round-trip unchanged. Body is preserved.
    """
    fm = parse(text)
    for key, value in patch.items():
        if value is None and key in CANONICAL_KEYS:
            _clear(fm, key)
            continue
        if key in CANONICAL_KEYS:
            setattr(fm, key, _coerce(key, value))
        else:
            fm.extra[key] = value
    return serialize(fm)


def collect_tags(texts: list[str]) -> list[str]:
    """Return the sorted unique union of tags across files."""
    seen: set[str] = set()
    for text in texts:
        for tag in parse(text).tags:
            seen.add(tag)
    return sorted(seen)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _load_yaml(raw: str) -> dict[str, Any]:
    """Parse YAML, tolerating malformed input.

    Tries the raw text first, then a recovery pass that
    quotes unescaped colons in scalar values (the most
    common source of breakage in human-written
    frontmatter, e.g. ``title: Foo: Bar``).
    """
    for candidate in (raw, _quote_colon_scalars(raw)):
        try:
            data = yaml.safe_load(candidate) or {}
        except yaml.YAMLError:
            continue
        if isinstance(data, dict):
            return data
    return {}


# Match ``key: value`` where the value is a simple scalar
# (not already quoted, not a flow collection, not a block
# scalar header, not an anchor or alias). This is the only
# shape we attempt to auto-quote on parse failure -- every
# other case is forwarded to PyYAML unchanged so we don't
# accidentally corrupt valid YAML on the recovery pass.
_SCALAR_LINE_RE = re.compile(
    r"^([A-Za-z_][A-Za-z0-9_-]*):"
    r"[ \t]+(?!['\"\[\{|>&*])(.+?)[ \t]*$",
)
_INNER_COLON_RE = re.compile(r":[ \t]")


def _quote_colon_scalars(raw: str) -> str:
    """Wrap unquoted scalar values that contain a colon in
    single quotes so PyYAML can parse the line.

    Only acts on simple ``key: value`` lines; anything that
    is already quoted, a flow collection, a block scalar
    header (``|`` / ``>``), or an anchor/alias (``&`` /
    ``*``) is left untouched. Embedded single quotes are
    doubled per YAML's quoting rules. Tab-separated colons
    count alongside spaces.
    """
    fixed_lines: list[str] = []
    for line in raw.splitlines(keepends=False):
        match = _SCALAR_LINE_RE.match(line)
        if match is None:
            fixed_lines.append(line)
            continue
        value = match.group(2)
        if not _INNER_COLON_RE.search(value):
            fixed_lines.append(line)
            continue
        key = match.group(1)
        escaped = value.replace("'", "''")
        fixed_lines.append(f"{key}: '{escaped}'")
    return "\n".join(fixed_lines) + (
        "\n" if raw.endswith("\n") else ""
    )


def _from_dict(
    data: dict[str, Any], *, body: str, raw: str,
) -> Frontmatter:
    """Build a ``Frontmatter`` from a YAML-parsed dict."""
    normalized = _rename_legacy(data)
    fm = Frontmatter(body=body, raw=raw)
    for key in CANONICAL_KEYS:
        if key in normalized:
            setattr(fm, key, _coerce(key, normalized.pop(key)))
    fm.extra = normalized
    return fm


def _rename_legacy(data: dict[str, Any]) -> dict[str, Any]:
    """Map legacy key names to their canonical equivalents.

    Canonical keys win over legacy aliases when both are
    present in the same file: we copy canonical keys first,
    then legacy keys only if their canonical name is not yet
    set. This makes the output independent of dict ordering.
    """
    out: dict[str, Any] = {
        key: value for key, value in data.items()
        if key not in _LEGACY_KEY_MAP
    }
    for key, value in data.items():
        canonical = _LEGACY_KEY_MAP.get(key)
        if canonical and canonical not in out:
            out[canonical] = value
    return out


def _coerce(key: str, value: Any) -> Any:
    """Coerce a YAML-loaded value into the canonical type."""
    if key == "tags":
        return _coerce_tags(value)
    if key == "title":
        return "" if value is None else str(value)
    if key == "created":
        return _coerce_date(value)
    if value is None:
        return None
    return str(value)


def _coerce_tags(value: Any) -> list[str]:
    """Accept list, comma-separated string, or scalar."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        parts = re.split(r"[,\s]+", value.strip())
        return [p for p in parts if p]
    return [str(value)]


def _coerce_date(value: Any) -> str | None:
    """Render a date/datetime as an ISO ``YYYY-MM-DD`` string.

    Strings pass through unchanged so the user's preferred
    formatting is preserved on round-trip.
    """
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip() or None


def _as_date(value: str) -> Any:
    """Coerce an ISO date string back to a ``date`` object so
    PyYAML emits it without quotes. Falls back to the original
    string for non-ISO values (e.g. partial dates like
    ``2026-03``).
    """
    from datetime import datetime
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return value


def _clear(fm: Frontmatter, key: str) -> None:
    """Reset a canonical key on the frontmatter to its empty
    value (None for optional, empty string/list otherwise)."""
    if key == "tags":
        fm.tags = []
    elif key == "title":
        fm.title = ""
    else:
        setattr(fm, key, None)


_TAGS_BLOCK_RE = re.compile(
    r"^tags:\s*\n((?:[ \t]*-\s.+\n)+)",
    re.M,
)


def _flow_format_tags(yaml_text: str) -> str:
    """Rewrite a block-style ``tags`` list as a flow list.

    PyYAML emits block style by default::

        tags:
        - ansible
        - it-admin

    The KB convention (and what every existing file uses) is the
    flow form ``tags: [ansible, it-admin]``. We rewrite only the
    ``tags`` field; other fields keep PyYAML's default style.
    """
    def replace(match: re.Match[str]) -> str:
        items = re.findall(r"-\s+(.+)", match.group(1))
        return f"tags: [{', '.join(items)}]\n"
    return _TAGS_BLOCK_RE.sub(replace, yaml_text)
