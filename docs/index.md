# Kaisho

Kaisho is a personal productivity platform that brings time tracking,
task management, customer billing, and AI-powered workflows into one
place. It runs on your machine, stores data in plain text files you
own, and stays out of your way.

## What You Get

**Track time without friction.**
Start a timer from the UI, the CLI, or the menu bar tray. Book
retroactively when you forget. See where your hours go with daily,
weekly, and monthly breakdowns.

**Manage work visually.**
A kanban board with drag-and-drop columns, customizable states, and
tags. Filter by customer, status, or tag. Archive what's done.

**Bill accurately.**
Assign hours to customers and contracts. Track budgets in real time.
Export invoices as CSV or Excel when the month ends.

**Capture everything.**
Inbox items, notes, and a knowledge base with full-text search. Drag
to reorder, promote inbox items to tasks, and move notes to your KB.

**Let AI do the busywork.**
An AI advisor that knows your tasks, hours, customers, and notes.
Ask it questions or let scheduled cron jobs generate briefings,
summaries, and research automatically.

**Work from anywhere.**
Desktop app (macOS, Windows, Linux) with a menu bar tray timer.
Mobile PWA for time tracking on the go. Cloud sync keeps everything
in step.

## How It Works

Kaisho is a Python backend (FastAPI) with a React frontend. Data
lives in org-mode or Markdown files inside `~/.kaisho/`. The CLI,
the web UI, and the API all operate on the same data.

```
You
 |
 +-- Web UI (localhost:8765)
 +-- CLI (kai)
 +-- Desktop App (Tauri)
 +-- Mobile PWA
 |
 v
FastAPI Server
 |
 +-- Services (business logic)
 +-- Pluggable Backends (org-mode, Markdown, JSON, SQL)
 |
 v
~/.kaisho/profiles/your-profile/
```

## Quick Links

<div class="grid cards" markdown>

-   :material-clock-fast:{ .lg .middle } **Get started in 5 minutes**

    ---

    Install Kaisho and track your first hour.

    [:octicons-arrow-right-24: Installation](getting-started/installation.md)

-   :material-keyboard:{ .lg .middle } **CLI Reference**

    ---

    Every command, every option, copy-paste ready.

    [:octicons-arrow-right-24: CLI Reference](cli/index.md)

-   :material-api:{ .lg .middle } **API Reference**

    ---

    REST endpoints for building integrations.

    [:octicons-arrow-right-24: API Reference](api/index.md)

-   :material-robot:{ .lg .middle } **AI & Automation**

    ---

    Set up the advisor, connect providers, schedule jobs.

    [:octicons-arrow-right-24: AI Guide](ai/advisor.md)

</div>
