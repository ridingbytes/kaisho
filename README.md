# Kaisho

<p align="center">
  <img src="logos/kaisho-logo.svg" alt="Kaisho" width="64" height="64" />
</p>

[![Tests](https://github.com/ridingbytes/kaisho/actions/workflows/test.yml/badge.svg)](https://github.com/ridingbytes/kaisho/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*The time- and mindkeeper.*

**The local-first AI work companion.** Give your AI a memory,
a calendar, and a to-do list.

Your AI starts every chat from zero. Kaisho is the memory
layer that fixes that: tasks, customers, time, notes and
code live in one place your AI reads and writes back to
through [MCP](https://modelcontextprotocol.io), so what you
do in one session is there in the next. Schedule agents to
run on your own timetable with the model and API key you
choose. Plug into Claude Code, Cursor and Claude Desktop.
Keep your data as plain text or in a SQL database -- local
on your machine, always yours.

**Kaisho** (開手) means "open hand" in Japanese martial arts
-- the position of readiness. An open hand holds your time
and your mind.


## What you get

### Local (free, open source, fully local)

- **MCP server** out of the box. One-line config for Claude
  Code / Cursor / Claude Desktop and any other MCP client.
  Your AI gains `add_task`, `book_time`, `list_customers`,
  `search_knowledge`, `add_project` and 60+ more tools that
  read and write your real data without copy-paste.
- **Agentic advisor** with read / write / destructive tool
  tiers, URL allowlist, per-session write caps. Bring your
  own model: Ollama, LM Studio, Claude API, OpenRouter,
  OpenAI, any OpenAI-compatible endpoint.
- **Cron-AI agents.** Scheduled jobs that run a prompt
  against your Kaisho data on your machine -- daily
  briefings, weekly invoice drafts, nightly KB digests.
  Templates included; write your own in YAML.
- **Kanban board, time tracking, customer budgets, notes,
  knowledge base, inbox.** Real productivity tool, not just
  an AI shell. Drag-and-drop tasks, billable/bookable
  contracts with budget bars, unbilled-entry preview, CSV
  export.
- **Projects.** A customer-scoped workspace that aggregates
  its tasks, time, notes, and files in one place, with a
  markdown description, milestones, tags, a deadline, and a
  status. A kanban board groups projects by status with
  drag-to-reorder, collapsible columns, and search; time
  rolls up automatically from assigned tasks.
- **Automations.** Every task and clock change emits a
  domain event that can fire a signed webhook to n8n, Make,
  Zapier, or any endpoint. A Settings panel manages
  endpoints, subscribed events, and a delivery log; an
  importable n8n recipe ships as a starting point.
- **Backend-agnostic storage.** Keep everything in
  Org-mode (default), Markdown, JSON, or a SQL database
  (SQLite or Postgres) for concurrent access. Web UI, CLI,
  MCP server and mobile app work identically across all of
  them. Convert between backends with `kai convert`.
- **Desktop app** with auto-updater for macOS (Apple
  Silicon), Linux and Windows.
- **CLI-first** (`kai`) with a responsive web dashboard.
  Works on desktop, tablet and phone.
- **Calendar feed.** Subscribe any CalDAV / iCal client
  (iCloud, Google, Outlook) to `/api/clocks/calendar.ics`
  to see time entries as calendar events.
- **Multiple profiles.** Switch backends and data
  directories per profile.
- **Docker-ready.** Single-container deployment for
  self-hosting.

### Optional cloud (self-host or hosted)

Everything above is free and works fully standalone. When you
want cross-device convenience, connect Kaisho to a
[kaisho-cloud](https://github.com/ridingbytes/kaisho-cloud)
server. It is open source too, so you can run your own on plain
PostgreSQL, or point at a Kaisho-hosted instance if you'd rather
not operate a server. Same features either way:

- **Cross-device sync + mobile PWA** for clock tracking,
  inbox, projects, and the advisor on the go.
- **Hosted AI gateway** so you can use a frontier model without
  wiring up your own key on every device.
- **MCP gateway** so the same tools stay reachable from
  Claude Code / Cursor when your laptop is closed.
- **Scheduled AI runs** on the server, firing even when
  you're offline.
- **Premium integrations** the advisor can read and act on:
  Google Calendar, Slack, Linear, GitHub Projects. Credentials
  are stored encrypted server-side.

No plans, no tiers: connect to a server and everything is
available. The whole stack is MIT.


## Quick start

### Prerequisites

- Python 3.12+
- Node.js 20+ and pnpm

### Install

```bash
git clone https://github.com/ridingbytes/kaisho.git
cd kaisho
pip install -e .
cd frontend && pnpm install && cd ..
```

### Run

```bash
bin/dev                  # Backend + frontend (default)
bin/dev --backend        # Backend only (:8766)
bin/dev --frontend       # Frontend only (:5173)
bin/dev --prod           # Production mode (:8766)
bin/dev --desktop        # Tauri desktop app
bin/dev --docker         # Docker container
bin/dev --profile demo   # Use a specific profile
bin/dev --port 9000      # Custom port
```

Open <http://localhost:5173> (dev) or
<http://localhost:8766> (prod).

### Wire up your AI editor (MCP)

Two transports, same tools:

```bash
# stdio -- launched per-client (no server needed):
#   "kaisho": { "command": "/path/to/kaisho/scripts/mcp-server.sh" }

# streamable HTTP -- served by a running `kai serve` at /mcp,
# with a Bearer token from Settings -> MCP:
#   "kaisho": {
#     "url": "http://localhost:8765/mcp",
#     "headers": { "Authorization": "Bearer <token>" }
#   }
```

See the
[MCP integration guide](https://docs.kaisho.dev/integrations/mcp)
for the exact config per editor.


## CLI

```bash
kai task list                          # List open tasks
kai task add "Fix bug" --customer Acme --tag @code
kai clock start --customer Acme        # Start timer
kai clock stop                         # Stop
kai clock book 3h --customer Acme      # Book hours
kai customer list                      # List customers
kai contract add Acme "Q3 Dev" --hours 60
kai project list                       # List projects
kai project add "Website" --customer Acme --due 2026-09-30
kai project assign T-123 P-abc --milestone M-1
kai inbox list                         # Show inbox
kai briefing                           # Morning overview
kai ask "Which customer needs attention?"
kai kb search "kubernetes"             # Knowledge base
kai cron list                          # Scheduled jobs
kai convert --from org --to sql \      # Backend migration
  --source ./data/profiles/default/org \
  --target sqlite:///./data/kaisho.db
```


## Architecture

- **Backend**: Python 3.12, FastAPI + uvicorn,
  pydantic-settings, SQLAlchemy, APScheduler.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS,
  TanStack React Query, dnd-kit, WebSocket for live
  updates.
- **Storage**: pluggable backends -- Org-mode (default),
  Markdown, JSON, SQL (SQLite / Postgres). Switchable per
  profile; converter ships in the box.
- **AI**: agentic tool loop with 60+ tools, tool-tier
  gating (read / write / destructive), URL allowlist.
  Bring-your-own provider OR use a connected server's hosted
  AI gateway.
- **MCP**: first-class server over two transports -- stdio
  (`scripts/mcp-server.sh`, spawned per-client) and
  streamable HTTP (mounted at `/mcp` on a running `kai
  serve`, Bearer-token authenticated) -- for any
  MCP-compatible client.
- **Real-time**: WebSocket + file watcher for live updates
  on external file changes.
- **Desktop**: Tauri v2 with auto-updater (macOS Apple
  Silicon, Linux, Windows).


## Project layout

```
kaisho/              Python package (backend)
  api/               FastAPI app + routers
    routers/         API endpoints by domain
  backends/          Storage backends
    org/             Org-mode (default)
    markdown/        Markdown
    json_backend/    JSON
    sql/             SQL (SQLite / Postgres)
  cli/               Click CLI commands
  cron/              Scheduler, executor, advisor tools
  services/          Business logic
  config.py          Settings (pydantic-settings)
frontend/            React SPA
  src/components/    UI components by domain
  src/hooks/         React Query hooks
  src/context/       React contexts (view, shortcuts,
                     toast)
  src/api/           API client
  src/utils/         Utilities
desktop/             Tauri v2 wrapper
  src-tauri/         Rust shell (sidecar, auto-updater)
  src/               Splash screen
tests/               pytest suite (800+ tests)
templates/           Default profile templates
prompts/             AI cron-job prompt templates
scripts/             mcp-server.sh, demo data, screenshots
```


## Configuration

Data lives in `data/profiles/<name>/` (relative to the
project) or `$KAISHO_HOME/profiles/<name>/`.

```
data/
  .active_profile            Current profile name
  profiles/<name>/
    user.yaml                User metadata
    settings.yaml            Tags, states, AI config
    jobs.yaml                Cron job definitions
    org/                     Org-mode data files (default)
      todos.org
      customers.org
      clocks.org
      inbox.org
      notes.org
      projects.org
    # OR markdown/, OR json/, OR a SQL DSN
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROFILE` | `default` | Active profile name |
| `KAISHO_HOME` | `./data` | Data directory |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8766` | Server port |
| `CORS_ORIGINS` | localhost | Comma-separated origins |
| `SERVE_FRONTEND` | `false` | Serve built frontend (Docker) |


## Development

```bash
pytest                     # Run the test suite
cd frontend && pnpm build  # Production frontend build
```

See [CLAUDE.md](CLAUDE.md) (gitignored, local-only) for the
session-time conventions and ecosystem rules across the four
kaisho repos.


## Companion projects

- **[kaisho-cloud](https://github.com/ridingbytes/kaisho-cloud)**
  -- the open-source, self-hostable sync + AI server: cloud
  sync, hosted AI + MCP gateway, cron worker, premium
  integrations, mobile PWA. Run your own on PostgreSQL, or use
  a Kaisho-hosted instance.
- **[kaisho-mode](https://github.com/ridingbytes/kaisho-mode)**
  -- Emacs Lisp client. Connects to a running local Kaisho
  for tasks, clocks and the advisor under `SPC n k`.
- **[kaisho-website](https://github.com/ridingbytes/kaisho-website)**
  -- the marketing site at
  [kaisho.dev](https://kaisho.dev).


## License

MIT. Run the desktop app, the MCP server, and the sync
layer entirely on your own hardware. The source is on
GitHub, the data is yours, and the architecture works
without us.
