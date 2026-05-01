"""Tests for ``${...}`` placeholder substitution and
the legacy-syntax migration."""
from kaisho.services.placeholders import (
    find_placeholders,
    is_known_placeholder,
    render_placeholders,
)


# -- render_placeholders ------------------------------------------

def test_substitutes_user_fields():
    body = "Hello ${user.name}, from ${user.company}."
    user = {
        "name": "Ramon",
        "company": "RIDING BYTES",
    }
    out, unresolved = render_placeholders(body, user=user)
    assert out == "Hello Ramon, from RIDING BYTES."
    assert unresolved == []


def test_substitutes_date():
    body = "Today is ${date}"
    out, _ = render_placeholders(
        body, date_iso="2026-05-01",
    )
    assert "2026-05-01" in out


def test_substitutes_fetch_results():
    body = "Data:\n${fetch_results}"
    out, _ = render_placeholders(
        body, fetch_results="<JSON>",
    )
    assert "<JSON>" in out


def test_renders_research_targets_as_bullet_list():
    body = "Targets:\n${user.research_targets}"
    user = {
        "research_targets": [
            "SENAITE", "Plone Python CMS",
        ],
    }
    out, _ = render_placeholders(body, user=user)
    assert "- SENAITE" in out
    assert "- Plone Python CMS" in out


def test_unknown_user_field_is_unresolved():
    body = "Hi ${user.compny}"
    out, unresolved = render_placeholders(body, user={})
    # Unresolved placeholder is left literal so a typo is
    # visible in the prompt rather than silently empty.
    assert out == "Hi ${user.compny}"
    assert unresolved == ["user.compny"]


def test_unknown_namespace_is_unresolved():
    body = "Hi ${other.foo}"
    out, unresolved = render_placeholders(body, user={})
    assert out == body
    assert unresolved == ["other.foo"]


def test_escape_with_backslash_renders_literal():
    """Authors who want literal ``${...}`` in prose can
    escape it with a backslash."""
    body = (
        "Use \\${user.company} to reference the company."
    )
    out, unresolved = render_placeholders(
        body, user={"company": "ACME"},
    )
    # The escape is stripped, the placeholder is NOT
    # substituted.
    assert "${user.company}" in out
    assert "ACME" not in out
    assert unresolved == []


def test_legal_curly_braces_are_passed_through():
    """JSON-like prose with naked ``{}`` must not be
    touched by the substitution."""
    body = '{"key": "value"} and ${user.name}'
    out, _ = render_placeholders(
        body, user={"name": "Ramon"},
    )
    assert '{"key": "value"}' in out
    assert "Ramon" in out


def test_missing_user_field_renders_empty():
    """A known field that's empty in the profile renders
    as empty string (so the surrounding prose still reads
    naturally) rather than as the literal placeholder."""
    body = "Company: ${user.company}!"
    out, unresolved = render_placeholders(body, user={})
    assert out == "Company: !"
    assert unresolved == []


# -- find_placeholders --------------------------------------------

def test_find_placeholders_returns_distinct_names():
    body = (
        "Hi ${user.name}, ${user.name}, ${user.company}, "
        "and a ${date}."
    )
    found = find_placeholders(body)
    assert found == {
        "user.name", "user.company", "date",
    }


# -- is_known_placeholder -----------------------------------------

def test_is_known_placeholder_accepts_known():
    assert is_known_placeholder("user.name")
    assert is_known_placeholder("user.company")
    assert is_known_placeholder("user.research_targets")
    assert is_known_placeholder("date")
    assert is_known_placeholder("fetch_results")


def test_is_known_placeholder_rejects_unknown():
    assert not is_known_placeholder("user.compny")
    assert not is_known_placeholder("other.foo")
    assert not is_known_placeholder("nope")


# -- migration ----------------------------------------------------

def test_migration_rewrites_legacy_tokens(tmp_path):
    from kaisho.services.placeholders_migration import (
        migrate_profile_prompts,
    )
    profile = tmp_path / "profile"
    prompts = profile / "prompts"
    prompts.mkdir(parents=True)
    p = prompts / "old.md"
    p.write_text(
        "Today {date} fetched {fetch_results}",
        encoding="utf-8",
    )

    changed = migrate_profile_prompts(profile)
    assert changed == 1
    assert p.read_text() == (
        "Today ${date} fetched ${fetch_results}"
    )

    # Idempotent on re-run.
    again = migrate_profile_prompts(profile)
    assert again == 0


def test_migration_skips_files_without_legacy(tmp_path):
    from kaisho.services.placeholders_migration import (
        migrate_profile_prompts,
    )
    profile = tmp_path / "profile"
    prompts = profile / "prompts"
    prompts.mkdir(parents=True)
    p = prompts / "new.md"
    p.write_text(
        "Today ${date}", encoding="utf-8",
    )
    assert migrate_profile_prompts(profile) == 0
