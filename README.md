# Kaisho

<p align="center">
  <img src="logos/kaisho-logo.svg" alt="Kaisho" width="64" height="64" />
</p>

[![Tests](https://github.com/ridingbytes/kaisho/actions/workflows/test.yml/badge.svg)](https://github.com/ridingbytes/kaisho/actions/workflows/test.yml)

**Kanban AI SHell Organizer** -- productivity system for
people who build things. Local-first, open source, free.

Kanban board, time tracking, customer budgets, AI advisor,
knowledge base, and more. CLI-first with a responsive web
dashboard.

**Kaisho** (開手) means "open hand" in Japanese martial
arts -- the position of readiness.


## Features

- **Kanban Board** -- drag-and-drop tasks with custom
  states, tags, customer assignment, status picker
- **Time Tracking** -- start/stop timer, manual booking,
  billable/bookable contracts, time insights dashboard
- **Customer Budgets** -- contracts with hour contingents,
  budget bars, usage alerts, billable tracking
- **Inbox** -- quick capture, triage, promote to task
- **AI Advisor** -- context-aware assistant with 32 tools
  (Ollama, LM Studio, Claude API, OpenRouter, OpenAI)
- **Scheduled Automation** -- cron jobs for daily
  briefings, project reports, business scouting
- **Knowledge Base** -- search and browse documents
- **GitHub Integration** -- issues and projects
- **Notes** -- tagged notes with customer assignment
- **Dashboard** -- stats, activity heatmap, billable
  split, budget overview, calendar
- **Responsive** -- works on desktop, tablet, and phone
- **Dark / Light Theme** -- Zinc palette (true neutral)
- **Multiple Profiles** -- different backends per profile
- **Docker Ready** -- single-container deployment
- **Desktop App** -- native window via Tauri for macOS
  (Apple Silicon), Windows, and Linux
  (see [`desktop/`](desktop/))
- **Cloud Sync** (paid plan) -- mobile clock tracking via
  PWA at cloud.kaisho.dev/m with password reset, markdown
  advisor, and plan badge. Entries sync back to the local
  app. Requires a sync or sync_ai plan via
  [kaisho-cloud](https://github.com/ridingbytes/kaisho-cloud)
- **Calendar Feed** -- subscribe any CalDAV/iCal client
  (iCloud, Google, Outlook) to
  `GET /api/clocks/calendar.ics` to see time entries as
  calendar events


## Quick Start

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
bin/dev --backend        # Backend only (:8765)
bin/dev --frontend       # Frontend only (:5173)
bin/dev --prod           # Production mode (:8765)
bin/dev --docker         # Docker container
bin/dev --profile demo   # Use specific profile
bin/dev --port 9000      # Custom port
```

Open http://localhost:5173 (dev) or http://localhost:8765 (prod).


## CLI

```bash
kai task list                         # List open tasks
kai task add "Fix bug" --customer Acme --tag @code
kai clock start --customer Acme       # Start timer
kai clock stop                        # Stop timer
kai clock book 3h --customer Acme     # Book hours
kai customer list                     # List customers
kai contract add Acme "Q3 Dev" --hours 60
kai inbox list                        # Show inbox
kai briefing                          # Morning overview
kai ask "Which customer needs attention?"
kai kb search "kubernetes"            # Knowledge base
kai cron list                         # Scheduled jobs
kai convert --from org --to markdown  # Backend conversion
```


## Project Layout

```
kaisho/              Python package (backend)
  api/               FastAPI app + routers
    routers/         API endpoints by domain
  backends/          Storage backends
    org/             Org-mode backend
    markdown/        Markdown backend
  cli/               Click CLI commands
  cron/              Scheduler, executor, tools
  services/          Business logic
  config.py          Settings (pydantic-settings)
frontend/            React SPA
  src/components/    UI components by domain
  src/hooks/         React Query hooks
  src/context/       React contexts (view, shortcuts,
                     toast)
  src/api/           API client
  src/utils/         Utilities
desktop/             Tauri v2 wrapper (native desktop app)
  src-tauri/         Rust shell (sidecar, auto-updater)
  src/               Splash screen
tests/               pytest tests (244 tests)
templates/           Default profile templates
prompts/             AI cron job prompt templates
scripts/             Screenshots, demo data
```


## Architecture

- **Backend**: Python 3.12, FastAPI, uvicorn,
  pydantic-settings, APScheduler, SQLAlchemy
- **Frontend**: React 18, TypeScript, Vite,
  Tailwind CSS, TanStack React Query, dnd-kit
- **Data**: pluggable backends (org-mode, Markdown)
- **Real-time**: WebSocket + file watcher for live
  updates on external file changes
- **AI**: agentic tool loop with 32 tools, supports
  Ollama, LM Studio, Claude API, OpenRouter, OpenAI


## Configuration

Data lives in `data/profiles/<name>/` (relative to the
project) or `$KAISHO_HOME/profiles/<name>/`.

```
data/
  user.yaml                  User metadata
  .active_profile            Current profile name
  profiles/<name>/
    settings.yaml            Tags, states, AI config
    jobs.yaml                Cron job definitions
    org/                     Org-mode data files
      todos.org
      customers.org
      clocks.org
      inbox.org
      notes.org
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROFILE` | `default` | Active profile name |
| `KAISHO_HOME` | `./data` | Data directory |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8765` | Server port |
| `CORS_ORIGINS` | localhost | Comma-separated origins |
| `SERVE_FRONTEND` | `false` | Serve built frontend (Docker) |


## Development

```bash
pytest                     # Run 244 tests
cd frontend && pnpm build  # Production build
```


## Companion projects

- **[desktop/](desktop/)** -- Tauri v2 wrapper that opens
  Kaisho in a native window on macOS (Apple Silicon),
  Windows, and Linux. Bundles a sidecar binary and
  includes an auto-updater. No terminal needed.
- **[kaisho-cloud](https://github.com/ridingbytes/kaisho-cloud)** --
  cloud sync service (requires paid sync or sync_ai plan).
  Provides a mobile PWA at cloud.kaisho.dev/m for time
  tracking on the go with password reset, markdown
  advisor, and plan badge. Entries sync back to your
  local kaisho when it connects. Configure via
  Settings -> Cloud Sync.


## License

MIT
