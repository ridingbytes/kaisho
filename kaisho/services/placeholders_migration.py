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
        try:
            original = path.read_text(encoding="utf-8")
        except OSError as exc:
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
            path.write_text(rewritten, encoding="utf-8")
            changed += 1

    if changed:
        log.info(
            "Migrated %d prompt file(s) to ${...} "
            "placeholder syntax in %s",
            changed, prompts_dir,
        )
    return changed
