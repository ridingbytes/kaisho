"""One-shot migration: legacy ``{date}`` /
``{fetch_results}`` placeholders → ``${...}``.

Runs at server startup. Idempotent — files already on
the new syntax are left untouched. Only the user's
profile prompts dir is touched; bundled templates ship
in the new syntax already.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

log = logging.getLogger(__name__)

# Match the bare legacy tokens. The negative-lookbehind
# is critical: ``${date}`` (the new syntax) contains
# ``{date}`` as a substring, so without ``(?<!\$)`` the
# migration would mangle already-migrated files into
# ``$${date}`` on every run.
_LEGACY_DATE = re.compile(r"(?<!\$)\{date\}")
_LEGACY_FETCH = re.compile(r"(?<!\$)\{fetch_results\}")


def migrate_profile_prompts(profile_dir: Path) -> int:
    """Rewrite legacy placeholders in
    ``profile_dir/prompts/*.md`` to the ``${...}``
    syntax. Returns the number of files modified.
    """
    prompts_dir = profile_dir / "prompts"
    if not prompts_dir.exists():
        return 0

    changed = 0
    for path in sorted(prompts_dir.glob("*.md")):
        # ``newline=""`` keeps the file's existing line
        # endings (CRLF on Windows hand-edits) — without
        # it, write_text would translate \n → os.linesep
        # and silently rewrite every line on Windows.
        # ``UnicodeDecodeError`` on a hand-edited prompt
        # in a non-UTF-8 encoding must not break server
        # startup; skip and warn instead.
        try:
            with open(
                path, "r",
                encoding="utf-8", newline="",
            ) as f:
                original = f.read()
        except (OSError, UnicodeDecodeError) as exc:
            log.warning(
                "Skipping migration for %s: %s",
                path, exc,
            )
            continue

        rewritten = _LEGACY_FETCH.sub(
            "${fetch_results}", original,
        )
        rewritten = _LEGACY_DATE.sub(
            "${date}", rewritten,
        )
        if rewritten != original:
            with open(
                path, "w",
                encoding="utf-8", newline="",
            ) as f:
                f.write(rewritten)
            changed += 1

    if changed:
        log.info(
            "Migrated %d prompt file(s) to ${...} "
            "placeholder syntax in %s",
            changed, prompts_dir,
        )
    return changed
