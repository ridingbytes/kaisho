# MCP Server

:octicons-tag-24: Added in v0.9.0
{ .version-badge }

Kaisho exposes its tools via the
[Model Context Protocol](https://modelcontextprotocol.io/) (MCP).
This lets any MCP-compatible client -- Claude Code, Claude Desktop,
Cursor, Zed -- interact with your Kaisho data directly, without
opening the UI.

## What This Enables

You work in your editor or AI assistant and Kaisho is just there.
No tab switching, no copy-paste. Ask Claude to start a timer, check
a budget, or create a task, and it calls Kaisho's tools behind the
scenes.

```
You in Claude Code
  |
  "Start a clock for Acme Biotech, working on the API"
  |
  v
Claude Code --> MCP --> kai mcp-server --> execute_tool("start_clock", ...)
  |
  v
  "Started: 09:14 -- Acme Biotech -- Working on the API"
```

## Quick Start

Start the MCP server:

```bash
kai mcp-server --profile work --allow read,write
```

This launches a stdio-based MCP server that exposes all read and
write tools for the `work` profile.

## Client Configuration

### Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "kaisho": {
      "command": "kai",
      "args": [
        "mcp-server",
        "--profile", "work",
        "--allow", "read,write"
      ]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config
(`~/Library/Application Support/Claude/claude_desktop_config.json`
on macOS):

```json
{
  "mcpServers": {
    "kaisho": {
      "command": "kai",
      "args": [
        "mcp-server",
        "--profile", "work",
        "--allow", "read,write"
      ]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "kaisho": {
      "command": "kai",
      "args": ["mcp-server", "-p", "work", "-a", "read,write"]
    }
  }
}
```

### Multiple Profiles

Register separate server entries per profile:

```json
{
  "mcpServers": {
    "kaisho-work": {
      "command": "kai",
      "args": ["mcp-server", "-p", "work", "-a", "read,write"]
    },
    "kaisho-personal": {
      "command": "kai",
      "args": ["mcp-server", "-p", "personal", "-a", "read"]
    }
  }
}
```

## Access Tiers

Not all tools are exposed by default. Three tiers control what the
MCP server makes available:

| Tier | Default | Description |
|------|---------|-------------|
| `read` | On | Query tasks, entries, customers, KB, GitHub |
| `write` | Off | Create/update tasks, start timers, book time |
| `destructive` | Off | Delete notes, archive tasks, run arbitrary CLI |

The `--allow` flag controls which tiers are active:

```bash
kai mcp-server --allow read             # read-only (default)
kai mcp-server --allow read,write       # read + write
kai mcp-server --allow destructive      # all tiers (destructive implies read,write)
```

MCP clients that support tool annotations see `readOnlyHint` and
`destructiveHint` flags, so they can display confirmation prompts
for write and destructive operations.

### Read Tools

| Tool | Description |
|------|-------------|
| `list_tasks` | Query kanban board with filters |
| `list_inbox` | List inbox items |
| `list_clock_entries` | Time entries by period |
| `list_customers` | All customers with budgets |
| `list_contracts` | Contracts for a customer |
| `list_notes` | All notes |
| `list_kb_files` | Knowledge base file tree |
| `search_knowledge` | Full-text KB search |
| `read_knowledge_file` | Read a KB file |
| `list_github_issues` | Open GitHub issues |
| `list_github_projects` | GitHub Projects v2 |
| `list_cron_jobs` | Scheduled jobs |
| `list_profiles` | Available profiles |
| `list_backups` | Backup archives |
| `get_time_insights` | Time analytics |
| `transcribe_youtube` | YouTube captions |
| `web_search` | Web search |
| `fetch_url` | Fetch URL content |

### Write Tools

| Tool | Description |
|------|-------------|
| `add_task` | Create task |
| `update_task` | Modify task fields |
| `move_task` | Change task status |
| `set_task_tags` | Replace task tags |
| `add_inbox_item` | Capture inbox item |
| `add_note` | Create note |
| `update_note` | Modify note |
| `start_clock` | Start timer |
| `stop_clock` | Stop timer |
| `book_time` | Book retroactive time |
| `update_clock_entry` | Edit clock entry |
| `batch_invoice` | Mark entries invoiced |
| `write_kb_file` | Create KB file |
| `create_skill` | Create advisor skill |
| `approve_url_domain` | Add URL to allowlist |
| `create_backup` | Create data backup |
| `trigger_cron_job` | Run cron job now |

### Destructive Tools

| Tool | Description |
|------|-------------|
| `archive_task` | Archive a task |
| `delete_note` | Delete a note |
| `delete_profile` | Delete a profile |
| `rename_profile` | Rename a profile |
| `execute_cli` | Run arbitrary CLI commands |

## Use Cases

### Session Start with Context

> "Start a clock for Acme Biotech, show me the open tasks for
> that customer, and check their budget."

Tools used: `start_clock` + `list_tasks` + `list_contracts`

### Capture While Coding

> "Add an inbox item: check if SSL certs expire this month."

Tools used: `add_inbox_item`

### Commit Follow-Up

> "Create a task for Beta Inc: write tests for the auth edge
> case. Tag it with backend and testing."

Tools used: `add_task` + `set_task_tags`

### End-of-Day Booking

> "Stop the clock, but only bill 2 hours. The rest was
> research. Then move task abc123 to DONE."

Tools used: `stop_clock` + `update_clock_entry` + `move_task`

### Morning Briefing

> "What's on my plate today? Focus on tasks with deadlines
> this week and tell me which customer is closest to their
> budget limit."

Tools used: `list_tasks` + `list_contracts` + `get_time_insights`

### Research to Knowledge Base

> "Search the web for current vLLM benchmarks, summarize the
> findings, and save them under kb/research/vllm-benchmarks.md."

Tools used: `web_search` + `fetch_url` + `write_kb_file`

### Cross-Context Workflow

This is the real power of MCP. A single prompt that combines
code context (your editor), business context (Kaisho), and
knowledge context (your KB):

> "I need to build feature X for Acme Biotech. Check how many
> hours are left on their contract, search my KB for notes about
> their API, and suggest a breakdown into 3 tasks."

Tools used: `list_contracts` + `search_knowledge` + `add_task`
(x3)

## Audit Log

Every tool call is logged to
`~/.kaisho/profiles/<profile>/mcp-audit.log` in JSON Lines format:

```json
{"ts": "2026-04-22T10:15:00+00:00", "tool": "list_tasks", "args": {"customer": "Acme"}, "ok": true}
{"ts": "2026-04-22T10:15:01+00:00", "tool": "start_clock", "args": {"customer": "Acme", "description": "API work"}, "ok": true}
```

This provides traceability for tool calls made outside the Kaisho
UI.

## Architecture

The MCP server reuses the same `execute_tool()` dispatcher as the
cron executor and AI advisor. All three interfaces call the same
backend functions, so tool behavior is identical everywhere.

```
Claude Code / Desktop / Cursor
  |
  v (stdio JSON-RPC)
kai mcp-server
  |
  v
execute_tool(name, args)  <-- same as cron + advisor
  |
  v
Backend services --> org/md/json/sql files
```

The server runs as a standalone process (started by the MCP client
as a subprocess). It accesses the profile's data files directly,
not via HTTP to the running FastAPI server.

## Security

**Transport**: stdio only (no network ports). The MCP client starts
the server as a subprocess. Trust boundary = OS user.

**Profile scoping**: the server operates on one profile, set at
launch time. Two profiles = two separate server processes.

**Tier filtering**: tools are filtered at startup based on
`--allow`. A read-only server cannot call write tools even if the
client requests them.

**No secrets exposure**: API keys and credentials in `settings.yaml`
are never returned by any tool. The settings service is not exposed
as an MCP tool.
