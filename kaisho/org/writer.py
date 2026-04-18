import os
from pathlib import Path

from .clock import format_clock
from .models import Heading, OrgFile


def format_heading_line(heading: Heading) -> str:
    """Reconstruct the heading line from fields."""
    stars = "*" * heading.level
    line = f"{stars} "
    if heading.keyword:
        line += f"{heading.keyword} "
    line += heading.title
    if heading.tags:
        tag_str = ":" + ":".join(heading.tags) + ":"
        line += f"  {tag_str}"
    return line


def _format_properties(heading: Heading) -> list[str]:
    """Format the :PROPERTIES: block."""
    if not heading.properties:
        return []
    lines = ["  :PROPERTIES:"]
    for key, val in heading.properties.items():
        lines.append(f"  :{key}: {val}")
    lines.append("  :END:")
    return lines


def _format_logbook(heading: Heading) -> list[str]:
    """Format the :LOGBOOK: block."""
    if not heading.logbook:
        return []
    lines = ["  :LOGBOOK:"]
    for clock in heading.logbook:
        lines.append(f"  {format_clock(clock)}")
    lines.append("  :END:")
    return lines


def _sanitize_body_line(line: str) -> str:
    """Escape org-mode keywords in body text so they
    are not misinterpreted by the parser.

    Prefixes dangerous lines with a zero-width space
    (U+200B) that is invisible but prevents matching.
    """
    stripped = line.lstrip()
    if (
        stripped.startswith("* ")
        or stripped == ":PROPERTIES:"
        or stripped == ":LOGBOOK:"
        or stripped == ":END:"
        or stripped.startswith("CLOCK: ")
    ):
        return "\u200b" + line
    return line


def _format_heading(heading: Heading) -> list[str]:
    """Reconstruct a heading from its fields."""
    lines = [format_heading_line(heading)]
    lines.extend(_format_properties(heading))
    lines.extend(_format_logbook(heading))
    lines.extend(
        _sanitize_body_line(ln) for ln in heading.body
    )
    for child in heading.children:
        lines.extend(_render_heading(child))
    return lines


def _render_heading(heading: Heading) -> list[str]:
    """Render a heading using raw_lines or reconstruction.

    When using raw_lines, children are appended separately because
    they are tracked as separate Heading objects by the parser.
    """
    if not heading.dirty and heading.raw_lines:
        lines = [line.rstrip("\n") for line in heading.raw_lines]
        for child in heading.children:
            lines.extend(_render_heading(child))
        return lines
    return _format_heading(heading)


def write_org_string(org_file: OrgFile) -> str:
    """Serialize an OrgFile to org-mode text."""
    lines: list[str] = list(org_file.preamble)
    for heading in org_file.headings:
        lines.extend(_render_heading(heading))
    return "\n".join(lines) + "\n"


def write_org_file(path: Path, org_file: OrgFile) -> None:
    """Atomic write: write to .tmp then os.replace."""
    content = write_org_string(org_file)
    tmp_path = path.with_suffix(".org.tmp")
    tmp_path.write_text(content, encoding="utf-8")
    os.replace(tmp_path, path)
