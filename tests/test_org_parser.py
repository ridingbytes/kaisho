"""Tests for the org-mode parser."""
import textwrap

import pytest

from omnicontrol.org.parser import parse_org_string
from omnicontrol.org.models import Heading, OrgFile

KEYWORDS = {"TODO", "NEXT", "IN-PROGRESS", "WAIT", "DONE", "CANCELLED"}


def _parse(text: str) -> OrgFile:
    return parse_org_string(textwrap.dedent(text), keywords=KEYWORDS)


def test_empty_file():
    doc = _parse("")
    assert doc.headings == []


def test_single_heading():
    doc = _parse("""\
        * TODO My task
    """)
    assert len(doc.headings) == 1
    h = doc.headings[0]
    assert h.level == 1
    assert h.keyword == "TODO"
    assert "My task" in h.title


def test_heading_with_tags():
    doc = _parse("""\
        * TODO Task with tags   :bug:prio-high:
    """)
    h = doc.headings[0]
    assert "bug" in h.tags
    assert "prio-high" in h.tags


def test_heading_with_properties():
    doc = _parse("""\
        * TODO Task
          :PROPERTIES:
          :CUSTOMER: ACME
          :END:
    """)
    h = doc.headings[0]
    assert h.properties.get("CUSTOMER") == "ACME"


def test_nested_headings():
    doc = _parse("""\
        * Level 1
        ** Level 2
        *** Level 3
    """)
    assert len(doc.headings) == 1
    assert len(doc.headings[0].children) == 1
    assert len(doc.headings[0].children[0].children) == 1


def test_multiple_top_level_headings():
    doc = _parse("""\
        * First
        * Second
        * Third
    """)
    assert len(doc.headings) == 3


def test_heading_no_keyword():
    doc = _parse("""\
        * Just a heading
    """)
    h = doc.headings[0]
    assert h.keyword is None
    assert "Just a heading" in h.title
