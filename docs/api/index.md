# API Reference

Kaisho exposes a REST API on `http://localhost:8765/api/`. All
endpoints return JSON unless noted otherwise.

## Base URL

```
http://localhost:8765
```

## Authentication

The local API has no authentication. It is designed for single-user
access on localhost. CORS is restricted to local development origins.

## Common Patterns

**List endpoints** return arrays:

```json
[{"id": "abc123", "title": "My task", ...}, ...]
```

**Create endpoints** return the created object with HTTP 201.

**Update endpoints** accept partial objects (only changed fields)
and return the updated object.

**Delete endpoints** return HTTP 204 with no body.

**Error responses** use standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 400 | Validation error (bad input) |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate name) |
| 502 | Cloud service unavailable |

Error bodies:

```json
{"detail": "Human-readable error message"}
```

## Health Check

```
GET /health
```

Returns `{"status": "ok"}`. Use this to verify the server is running.

## WebSocket

Real-time updates are pushed via WebSocket at `ws://localhost:8765/ws`.
See [WebSocket](websocket.md).

## Endpoints by Domain

| Section | Prefix | Description |
|---------|--------|-------------|
| [Clocks](clocks.md) | `/api/clocks` | Time tracking |
| [Tasks](tasks.md) | `/api/kanban` | Task management |
| [Customers](customers.md) | `/api/customers` | Customer and contract CRUD |
| [Inbox](inbox.md) | `/api/inbox` | Inbox item capture and triage |
| [Notes](notes.md) | `/api/notes` | Note management |
| [Knowledge](knowledge.md) | `/api/knowledge` | Knowledge base files |
| [Dashboard](dashboard.md) | `/api/dashboard` | Summary metrics |
| [Advisor](advisor.md) | `/api/advisor` | AI assistant |
| [Cron](cron.md) | `/api/cron` | Scheduled jobs |
| [GitHub](github.md) | `/api/github` | GitHub integration |
| [Cloud Sync](cloud-sync.md) | `/api/cloud-sync` | Cloud synchronization |
| [Settings](settings.md) | `/api/settings` | Configuration |
| [WebSocket](websocket.md) | `/ws` | Real-time events |
