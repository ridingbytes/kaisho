# Settings File

Each profile has a `settings.yaml` that controls task states, tags,
AI providers, paths, and more. Edit it in **Settings** in the UI or
directly in the file.

## Location

```
~/.kaisho/profiles/<profile>/settings.yaml
```

## Structure

```yaml
# Task states (kanban columns)
task_states:
  - name: TODO
    label: To Do
    color: "#6b7280"
  - name: NEXT
    label: Next
    color: "#f59e0b"
  - name: IN-PROGRESS
    label: In Progress
    color: "#3b82f6"
  - name: WAIT
    label: Waiting
    color: "#8b5cf6"
  - name: DONE
    label: Done
    color: "#10b981"
    done: true
  - name: CANCELLED
    label: Cancelled
    color: "#ef4444"
    done: true

# Tags with colors
tags:
  - name: urgent
    color: "#ef4444"
    description: "Needs immediate attention"
  - name: backend
    color: "#3b82f6"
  - name: frontend
    color: "#10b981"

# Custom types
customer_types: [agency, startup, enterprise, internal]
inbox_types: [NOTE, EMAIL, LEAD, IDEA, BUG, FEATURE]
inbox_channels: [email, phone, chat, meeting, web]

# Storage backend
backend: org
org_dir: ""           # Empty = default profile path
markdown_dir: ""
json_dir: ""
sql_dsn: ""

# AI providers
ollama_url: "http://localhost:11434"
ollama_cloud_url: ""
ollama_api_key: ""
lm_studio_url: ""
claude_api_key: ""
openrouter_url: ""
openrouter_api_key: ""
openai_url: ""
openai_api_key: ""
brave_api_key: ""
tavily_api_key: ""

# Model selection
advisor_model: "ollama:qwen3:14b"
cron_model: "ollama:gemma4:latest"

# GitHub
github:
  token: ""
  base_url: "https://api.github.com"

# Knowledge base sources
kb_sources:
  - label: Personal
    path: ~/.kaisho/profiles/work/knowledge

# Backup
backup:
  directory: ""
  keep: 5
  interval_hours: 24

# Cloud sync
cloud_sync:
  url: ""
  api_key: ""
  use_cloud_ai: false

# Invoice export columns
invoice_export:
  columns:
    - field: date
      format: "%Y-%m-%d"
    - field: customer
    - field: description
    - field: hours
      format: "%.2f"
```

## Task States

Each state has:

| Field | Description |
|-------|-------------|
| `name` | Internal identifier (e.g., `TODO`) |
| `label` | Display name (e.g., "To Do") |
| `color` | Hex color code |
| `done` | Whether this state counts as completed |

States define the kanban columns. Their order in the YAML determines
the column order in the UI.

## Tags

Tags are colored labels for tasks. Define them here with a name,
color, and optional description. Tags not defined in settings still
work but appear without a color.

## AI Provider Settings

See [AI Providers](../ai/providers.md) for detailed setup
instructions for each provider.

## KB Sources

Add multiple source directories. Each needs a `label` (shown in the
UI sidebar) and a `path` (absolute or `~`-prefixed).
