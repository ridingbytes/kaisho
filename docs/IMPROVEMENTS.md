# Future Improvements

Tracked ideas for later implementation. Not bugs, not
blockers -- just things that would make the system better.


## Advisor: Selective Skill Loading

Currently all skills from SKILLS/*.md are injected into
every advisor prompt. This works with 6 skills but won't
scale to 20+.

Better approach:
1. System prompt includes only a skill index (name +
   one-line description per skill)
2. Model picks relevant skill by name
3. A `use_skill(name)` tool loads the full content

See: `kaisho/services/advisor.py` line 242-253
(build_system_prompt skill injection).


## Advisor: Streaming Responses

The advisor currently waits for the full response before
displaying. Streaming would show tokens as they arrive.
Requires WebSocket or SSE from the API endpoint.


## Backend: Alembic Migrations

The SQL backend uses `create_all()` which can't alter
existing tables. When the schema evolves, we need Alembic
migrations to update existing databases without data loss.


## Desktop: Tauri App

Scaffold exists at desktop/ but is not yet functional.
Needs PyInstaller sidecar bundling and CI/CD for
cross-platform builds.
