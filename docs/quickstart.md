# Quickstart

## Prerequisites

- Python 3.12+
- Node.js 18+ and pnpm
- An org-mode or markdown file store (default: `~/ownCloud/cowork/org/`)

## Backend setup

```bash
git clone https://github.com/ridingbytes/omnicontrol
cd omnicontrol
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Configuration

Copy the example env file and adjust paths:

```bash
cp .env.example .env   # if provided, otherwise create .env
```

Minimal `.env`:

```
ORG_DIR=~/ownCloud/cowork/org
SETTINGS_FILE=./settings.yaml
PORT=8765
BACKEND=org
```

All variables have sensible defaults. `BACKEND` selects the storage
driver (`org` or `markdown`).

## First run

### CLI only

```bash
oc briefing          # morning overview
oc task list         # list open tasks
oc clock status      # check active timer
```

### API + frontend

Terminal 1 — start the backend:

```bash
oc serve
# API available at http://localhost:8765
# Docs at http://localhost:8765/docs
```

Terminal 2 — start the frontend:

```bash
cd frontend
pnpm install
pnpm dev
# Open http://localhost:5173
```

## Task states

Out of the box, OmniControl uses the built-in states:
`TODO`, `NEXT`, `IN-PROGRESS`, `WAIT`, `DONE`, `CANCELLED`.

Customise them in `settings.yaml`:

```yaml
task_states:
  - name: TODO
    label: To Do
    color: "#64748b"
    done: false
  - name: IN-PROGRESS
    label: In Progress
    color: "#f59e0b"
    done: false
  - name: DONE
    label: Done
    color: "#10b981"
    done: true
```

Or use the CLI:

```bash
oc config add-state REVIEW --label "In Review" --color "#8b5cf6" \
    --after IN-PROGRESS
```

## Tags

```yaml
tags:
  - name: urgent
    color: "#ef4444"
    description: Must ship this week
  - name: bug
    color: "#f97316"
    description: Defect in existing functionality
```

Or:

```bash
oc tag add urgent --color "#ef4444" --description "Must ship this week"
```
