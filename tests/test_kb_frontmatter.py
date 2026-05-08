"""Tests for the KB YAML frontmatter parser/writer."""
from kaisho.services import kb_frontmatter as fm


def test_parses_canonical_frontmatter():
    text = (
        "---\n"
        "title: Ansible\n"
        "tags: [ansible, it-admin]\n"
        "created: 2026-03-09\n"
        "---\n"
        "\n"
        "# Body\n"
    )
    parsed = fm.parse(text)
    assert parsed.title == "Ansible"
    assert parsed.tags == ["ansible", "it-admin"]
    assert parsed.created == "2026-03-09"
    assert parsed.body == "\n# Body\n"
    assert parsed.raw  # not empty


def test_no_frontmatter_keeps_body_intact():
    text = "# Just a markdown file\n\nbody body\n"
    parsed = fm.parse(text)
    assert parsed.title == ""
    assert parsed.tags == []
    assert parsed.body == text
    assert parsed.raw == ""


def test_legacy_date_renames_to_created():
    text = (
        "---\n"
        "title: Old\n"
        "date: 2026-01-01\n"
        "tags: []\n"
        "---\n"
        "body\n"
    )
    parsed = fm.parse(text)
    assert parsed.created == "2026-01-01"
    assert "date" not in parsed.extra


def test_canonical_overrides_legacy_alias():
    text = (
        "---\n"
        "title: Old\n"
        "date: 2026-01-01\n"
        "created: 2026-02-02\n"
        "tags: []\n"
        "---\n"
        "body\n"
    )
    parsed = fm.parse(text)
    assert parsed.created == "2026-02-02"


def test_malformed_yaml_yields_empty_frontmatter_not_crash():
    text = (
        "---\n"
        "title: : :\n"
        "tags: [unterminated\n"
        "---\n"
        "body\n"
    )
    parsed = fm.parse(text)
    assert parsed.title == ""
    assert parsed.tags == []
    assert parsed.body == "body\n"


def test_tags_accept_comma_separated_string():
    text = (
        "---\n"
        "title: x\n"
        "tags: ansible, it-admin, debian\n"
        "---\n"
    )
    parsed = fm.parse(text)
    assert parsed.tags == ["ansible", "it-admin", "debian"]


def test_serialize_emits_flow_style_tags():
    parsed = fm.Frontmatter(
        title="x", tags=["a", "b", "c"], body="body\n",
    )
    out = fm.serialize(parsed)
    assert "tags: [a, b, c]" in out
    assert out.endswith("---\n\nbody\n")


def test_serialize_omits_empty_optional_keys():
    parsed = fm.Frontmatter(
        title="x", tags=[], customer=None, status="",
        body="body\n",
    )
    out = fm.serialize(parsed)
    assert "customer" not in out
    assert "status" not in out
    assert "tags: []" in out


def test_round_trip_preserves_body_verbatim():
    original = (
        "---\n"
        "title: x\n"
        "tags: [a, b]\n"
        "---\n"
        "\n"
        "# Body\n"
        "\n"
        "Two trailing blank lines.\n"
        "\n"
    )
    out = fm.serialize(fm.parse(original))
    assert "# Body\n" in out
    assert "Two trailing blank lines." in out


def test_update_patches_keys_and_preserves_body():
    text = (
        "---\n"
        "title: old\n"
        "tags: [a]\n"
        "---\n"
        "\n"
        "body\n"
    )
    out = fm.update(text, {"title": "new", "tags": ["a", "b"]})
    parsed = fm.parse(out)
    assert parsed.title == "new"
    assert parsed.tags == ["a", "b"]
    assert "body" in parsed.body


def test_update_writes_frontmatter_when_missing():
    text = "# Just markdown\nbody\n"
    out = fm.update(text, {"title": "Hello", "tags": ["x"]})
    parsed = fm.parse(out)
    assert parsed.title == "Hello"
    assert parsed.tags == ["x"]
    assert "Just markdown" in parsed.body


def test_update_clears_optional_key_when_set_to_none():
    text = (
        "---\n"
        "title: x\n"
        "tags: []\n"
        "customer: ACME\n"
        "---\n"
        "body\n"
    )
    out = fm.update(text, {"customer": None})
    parsed = fm.parse(out)
    assert parsed.customer is None
    assert "customer" not in out


def test_update_preserves_unknown_keys_via_extra():
    text = (
        "---\n"
        "title: x\n"
        "tags: []\n"
        "weird_key: weird_value\n"
        "---\n"
        "body\n"
    )
    out = fm.update(text, {"title": "y"})
    assert "weird_key: weird_value" in out


def test_collect_tags_returns_sorted_unique_union():
    files = [
        "---\ntitle: a\ntags: [debian, linux]\n---\n",
        "---\ntitle: b\ntags: [ansible, debian]\n---\n",
        "no frontmatter file",
    ]
    assert fm.collect_tags(files) == [
        "ansible", "debian", "linux",
    ]


def test_to_dict_includes_only_set_optional_keys():
    parsed = fm.Frontmatter(
        title="x", tags=["a"], customer="ACME",
    )
    out = parsed.to_dict()
    assert out == {
        "title": "x", "tags": ["a"], "customer": "ACME",
    }


def test_unicode_title_round_trips():
    text = (
        "---\n"
        "title: Übergröße — naïve résumé\n"
        "tags: [unicode, тест]\n"
        "---\n"
        "body\n"
    )
    parsed = fm.parse(text)
    assert parsed.title == "Übergröße — naïve résumé"
    assert parsed.tags == ["unicode", "тест"]
    out = fm.serialize(parsed)
    again = fm.parse(out)
    assert again.title == parsed.title
    assert again.tags == parsed.tags


def test_body_with_thematic_break_not_consumed():
    text = (
        "---\n"
        "title: x\n"
        "tags: []\n"
        "---\n"
        "\n"
        "First section\n"
        "\n"
        "---\n"
        "\n"
        "Second section after thematic break\n"
    )
    parsed = fm.parse(text)
    assert "First section" in parsed.body
    assert "Second section" in parsed.body
    assert parsed.body.count("---") == 1


def test_recovery_quotes_only_keys_with_inner_colon():
    text = (
        "---\n"
        "title: Foo: Bar\n"
        "tags: [a, b]\n"
        "---\n"
        "body\n"
    )
    parsed = fm.parse(text)
    assert parsed.title == "Foo: Bar"
    assert parsed.tags == ["a", "b"]


def test_recovery_leaves_block_scalars_alone():
    text = (
        "---\n"
        "title: x\n"
        "description: |\n"
        "  multi-line\n"
        "  block scalar with: a colon inside\n"
        "tags: []\n"
        "---\n"
    )
    parsed = fm.parse(text)
    # description ends up in extra (not a canonical key)
    desc = parsed.extra.get("description") or ""
    assert "multi-line" in desc
    assert "a colon inside" in desc


def test_recovery_handles_tab_separated_colons():
    text = (
        "---\n"
        "title: Foo:\tBar\n"
        "tags: []\n"
        "---\n"
    )
    parsed = fm.parse(text)
    assert parsed.title == "Foo:\tBar"


def test_normalize_is_idempotent_for_unicode():
    raw = (
        "---\n"
        "title: Übergröße\n"
        "tags: [тест]\n"
        "---\n"
        "body\n"
    )
    once = fm.serialize(fm.parse(raw))
    twice = fm.serialize(fm.parse(once))
    assert once == twice
