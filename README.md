# Kaisho

[![Tests](https://github.com/ridingbytes/kaisho/actions/workflows/test.yml/badge.svg)](https://github.com/ridingbytes/kaisho/actions/workflows/test.yml)

Personal productivity platform for freelancers and consultants.
Kanban board, time tracking, customer budgets, AI advisor,
knowledge base, and more. CLI-first with a web dashboard.

**Kaisho** = **K**anban + **AI** + **Sh**ell + **O**rganizer


## Features

- **Kanban Board** -- tasks with custom states, tags,
  drag-and-drop, customer assignment
- **Time Tracking** -- start/stop timer, manual booking,
  per-customer clock entries
- **Customer Budgets** -- contracts with hour contingents,
  budget bars, usage alerts
- **Inbox** -- quick capture, process later
- **AI Advisor** -- ask questions about your work
  (Ollama, Claude, OpenRouter)
- **Knowledge Base** -- search and browse your documents
- **GitHub Integration** -- issues and projects
- **Scheduled Automation** -- cron jobs for briefings,
  reports, and maintenance
- **Notes** -- org-mode notes viewer
- **Dashboard** -- stats, budget overview, calendar
- **Multi-User / Multi-Profile** -- separate data per user
  and profile
- **Dark / Light Theme** -- Graphite Lavender palette


## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+ and pnpm
- Git

### Install

```bash
git clone https://github.com/ridingbytes/kaisho.git
cd kaisho

# Backend
pip install -e .

# Frontend
cd frontend && pnpm install && cd ..
```

### Run

```bash
# Option 1: use the run script
./run.sh

# Option 2: use make
make dev

# Option 3: start manually
kai serve &              # Backend on :8765
cd frontend && pnpm dev  # Frontend on :5173
```

Open http://localhost:5173 in your browser.


## CLI

The `kai` command provides full access from the terminal:

```bash
kai task list                           # List open tasks
kai task add "Fix login bug" --customer "Acme" --tag "@code"
kai clock start --customer "Acme"       # Start timer
kai clock stop                          # Stop timer
kai clock book 3h --customer "Acme"     # Book hours
kai customer list                       # List customers
kai customer add "NewCo" --type agency --budget 80
kai contract add "Acme" "Q3 Dev" --hours 60
kai inbox list                          # Show inbox
kai briefing                            # Morning overview
kai ask "Which customer needs attention?"
kai kb search "kubernetes"              # Knowledge base
kai cron list                           # Scheduled jobs
kai gh issues                           # GitHub issues
```


## Development

### Project Layout

```
kaisho/              Python package (backend)
  api/               FastAPI app + routers
  backends/          Storage backends (org, markdown, json)
  cli/               Click CLI commands
  services/          Business logic
  config.py          Settings (pydantic-settings)
frontend/            React SPA (TypeScript, Vite, Tailwind)
  src/components/    UI components by domain
  src/hooks/         React hooks
  src/api/           API client
tests/               pytest tests
desktop/             Tauri desktop app scaffold
scripts/             Build and automation scripts
product/             Product strategy and website
templates/           Default profile templates
```

### Dev Commands

```bash
# Run tests
pytest

# Build frontend
cd frontend && pnpm build

# Start dev servers
make dev

# Preview product website
bash scripts/serve-website.sh
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROFILE` | `default` | Active profile name |
| `KAISHO_HOME` | (auto) | Data directory override |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8765` | Server port |
| `CORS_ORIGINS` | localhost | Comma-separated origins |


## Architecture

- **Backend**: Python 3.12, FastAPI, uvicorn, pydantic-settings,
  APScheduler, aiosqlite
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS,
  TanStack React Query, WebSocket
- **Data**: file-based (org-mode, Markdown, or JSON backends)
- **Desktop**: Tauri v2 (optional, wraps the web app)


## Configuration

Data lives in `~/.kaisho/` or `./data/` (whichever exists).
Multiple profiles allow different backends and settings.

```
data/
  user.yaml                  # User metadata
  .active_profile            # Current profile
  profiles/<profile>/
    settings.yaml            # Task states, tags, AI config
    jobs.yaml                # Cron job definitions
    org/                     # Org-mode data files
      todos.org
      customers.org
      clocks.org
      inbox.org
```


## License

MIT
