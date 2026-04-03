import re
from pathlib import Path

from .clock import parse_clock_line
from .models import Heading, OrgFile

KEYWORDS = {
    "TODO", "NEXT", "IN-PROGRESS", "WAIT",
    "DONE", "CANCELLED",
}

HEADING_RE = re.compile(r"^(\*+)\s+(.*)$")
TAG_RE = re.compile(
    r"\s+(:[a-zA-Z0-9_@#-]+(?::[a-zA-Z0-9_@#-]+)*:)\s*$"
)
PROPERTY_RE = re.compile(r"^\s*:([A-Z_][A-Z0-9_]*):\s+(.*?)\s*$")
STATE_CHANGE_RE = re.compile(
    r'^\s*-\s+State\s+"[^"]+"\s+from\s+"[^"]+"'
)


def _extract_keyword(rest: str, keywords: set[str]) -> tuple[str | None, str]:
    """Extract keyword from heading rest text.

    Returns (keyword, remaining_title).
    """
    parts = rest.split(None, 1)
    if parts and parts[0] in keywords:
        title = parts[1] if len(parts) > 1 else ""
        return parts[0], title
    return None, rest


def _extract_tags(title: str) -> tuple[str, list[str]]:
    """Extract tags from heading title.

    Returns (clean_title, tags_list).
    """
    m = TAG_RE.search(title)
    if not m:
        return title.rstrip(), []
    tag_str = m.group(1)
    clean = title[: m.start()].rstrip()
    tags = [t for t in tag_str.strip(":").split(":") if t]
    return clean, tags


def _parse_heading_line(
    line: str, keywords: set[str]
) -> tuple[int, str | None, str, list[str]] | None:
    """Parse a heading line.

    Returns (level, keyword, title, tags) or None.
    """
    m = HEADING_RE.match(line)
    if not m:
        return None
    level = len(m.group(1))
    rest = m.group(2)
    keyword, rest = _extract_keyword(rest, keywords)
    title, tags = _extract_tags(rest)
    return level, keyword, title, tags


def _parse_property_line(line: str) -> tuple[str, str] | None:
    """Parse a :KEY: value property line."""
    m = PROPERTY_RE.match(line)
    if m:
        return m.group(1), m.group(2)
    return None


def _is_end_marker(line: str) -> bool:
    return line.strip() == ":END:"


def _is_logbook_marker(line: str) -> bool:
    return line.strip() == ":LOGBOOK:"


def _is_properties_marker(line: str) -> bool:
    return line.strip() == ":PROPERTIES:"


def _is_clock_line(line: str) -> bool:
    return "CLOCK:" in line


def _build_heading(
    level: int,
    keyword: str | None,
    title: str,
    tags: list[str],
) -> Heading:
    return Heading(
        level=level,
        keyword=keyword,
        title=title,
        tags=tags,
    )


class _ParserState:
    """Mutable parser state for the line-by-line state machine."""

    def __init__(self) -> None:
        self.in_properties = False
        self.in_logbook = False


def _process_heading_line(
    line: str, heading: Heading, state: _ParserState
) -> None:
    """Process a single body line for a heading."""
    stripped = line.strip()

    if state.in_properties:
        if _is_end_marker(line):
            state.in_properties = False
        else:
            pair = _parse_property_line(line)
            if pair:
                heading.properties[pair[0]] = pair[1]
        return

    if state.in_logbook:
        if _is_end_marker(line):
            state.in_logbook = False
        elif _is_clock_line(line):
            clock = parse_clock_line(line)
            if clock:
                heading.logbook.append(clock)
        return

    if _is_properties_marker(line):
        state.in_properties = True
        return

    if _is_logbook_marker(line):
        state.in_logbook = True
        return

    if _is_clock_line(line):
        clock = parse_clock_line(line)
        if clock:
            heading.logbook.append(clock)
        return

    if STATE_CHANGE_RE.match(line):
        heading.body.append(stripped)
        return

    heading.body.append(line.rstrip("\n"))


def _insert_heading(headings: list[Heading], new_heading: Heading) -> None:
    """Insert heading into tree at the correct level."""
    if not headings or new_heading.level == 1:
        headings.append(new_heading)
        return

    parent = _find_parent(headings, new_heading.level)
    if parent is not None:
        parent.children.append(new_heading)
    else:
        headings.append(new_heading)


def _find_parent(
    headings: list[Heading], level: int
) -> Heading | None:
    """Find the deepest heading that should be parent for given level."""
    if not headings:
        return None
    last = headings[-1]
    if last.level < level:
        child_parent = _find_parent(last.children, level)
        if child_parent is not None:
            return child_parent
        return last
    return None


def parse_org_string(
    text: str, keywords: set[str] | None = None
) -> OrgFile:
    """Parse org-mode text into an OrgFile."""
    kw = keywords if keywords is not None else KEYWORDS
    org_file = OrgFile()
    lines = text.splitlines(keepends=True)

    current_heading: Heading | None = None
    state = _ParserState()
    # Stack of (heading, state) for nested headings
    heading_stack: list[tuple[Heading, _ParserState]] = []

    for line in lines:
        parsed = _parse_heading_line(line.rstrip("\n"), kw)
        if parsed is not None:
            level, keyword, title, tags = parsed
            # Finalize current heading if any
            if current_heading is not None:
                _close_heading(
                    current_heading, heading_stack, org_file.headings
                )
            new_h = _build_heading(level, keyword, title, tags)
            new_h.raw_lines.append(line)
            current_heading = new_h
            state = _ParserState()
        elif current_heading is None:
            org_file.preamble.append(line.rstrip("\n"))
        else:
            current_heading.raw_lines.append(line)
            _process_heading_line(line, current_heading, state)

    if current_heading is not None:
        _close_heading(current_heading, heading_stack, org_file.headings)

    return org_file


def _close_heading(
    heading: Heading,
    stack: list[tuple[Heading, "_ParserState"]],
    top_level: list[Heading],
) -> None:
    """Place a completed heading in the correct position."""
    _insert_heading(top_level, heading)


def parse_org_file(
    path: Path, keywords: set[str] | None = None
) -> OrgFile:
    """Parse an org-mode file into an OrgFile."""
    text = path.read_text(encoding="utf-8")
    org_file = parse_org_string(text, keywords)
    org_file.path = str(path)
    return org_file
