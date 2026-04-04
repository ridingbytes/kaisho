# Developer Guide

## Architecture overview

```
omnicontrol/
├── backends/          # Pluggable storage drivers
│   ├── base.py        # Abstract base classes (the interface contract)
│   ├── org/           # Org-mode implementation (default)
│   └── markdown/      # Markdown stub (not yet implemented)
├── org/               # Low-level org-mode parser and writer
│   ├── models.py      # Heading, Clock, OrgFile dataclasses
│   ├── parser.py      # Text → OrgFile tree
│   ├── clock.py       # Clock entry parsing and formatting
│   └── writer.py      # OrgFile → text (round-trip safe)
├── services/          # Shared utilities used by backends
│   └── settings.py    # settings.yaml read/write
├── cli/               # Click command groups
└── api/               # FastAPI application
    ├── app.py
    ├── routers/       # One router per domain
    ├── watcher/       # watchfiles background task
    └── ws/            # WebSocket connection manager

frontend/              # Vite + React 18 + TypeScript
├── src/
│   ├── api/           # Fetch wrappers for all endpoints
│   ├── hooks/         # TanStack Query hooks + WebSocket
│   └── components/
│       ├── kanban/    # KanbanBoard, KanbanColumn, TaskCard
│       └── clock/     # ClockWidget, ActiveTimer, forms, list
```

## Data flow

```
data files on disk
       ↓
   org/ parser
       ↓
 backends/org/*     ← implements backends/base.py ABCs
       ↓
 get_backend()      ← cached singleton, reads BACKEND env var
       ↓
  CLI / API routers
       ↓
  browser / terminal
```

The CLI and API never import from `org/` or `services/kanban` directly.
All storage access goes through `get_backend()`.

## Backend interface

Four abstract base classes live in `backends/base.py`:

| Class             | Methods                                                                            |
|-------------------+------------------------------------------------------------------------------------|
| `TaskBackend`     | `list_tasks`, `add_task`, `move_task`, `set_tags`, `archive_task`, `list_all_tags` |
| `ClockBackend`    | `list_entries`, `get_active`, `get_summary`, `start`, `stop`, `quick_book`         |
| `InboxBackend`    | `list_items`, `add_item`, `remove_item`, `promote_to_task`                         |
| `CustomerBackend` | `list_customers`, `get_customer`, `get_budget_summary`                             |

Each class also exposes `data_file: Path | None` used by the `edit`
CLI subcommands.

`InboxBackend.promote_to_task` receives the `TaskBackend` instance as
a parameter so that inbox → task promotion works across any backend
combination without cross-service imports.

## Adding a new backend

1. Create `omnicontrol/backends/myformat/__init__.py`.
2. Implement `MyFormatTaskBackend(TaskBackend)`, etc.
3. Add a `make_myformat_backend(cfg) -> tuple[...]` factory that
   returns the four backends and a `list[Path]` of paths to watch.
4. Register it in `backends/__init__.py`:

```python
elif backend_type == "myformat":
    from .myformat import make_myformat_backend
    tasks, clocks, inbox, customers, watch = make_myformat_backend(cfg)
```

5. Set `BACKEND=myformat` in `.env`.

The markdown stub in `backends/markdown/` is a ready-made starting
point with all method signatures in place.

## Return types

All backend methods return plain `dict` objects (not Pydantic models)
to keep the interface simple and language-independent. The dict shapes
are documented in `backends/base.py` docstrings.

## File watcher

The API starts a background `asyncio` task via `watchfiles.awatch`
that monitors every path in `backend.watch_paths`. When a file
changes, it maps the file stem to a WebSocket resource name using
`_STEM_TO_RESOURCE` in `api/watcher/service.py` and broadcasts a
`file_changed` event. The frontend's `useWebSocket` hook calls
`queryClient.invalidateQueries` on the matching query key.

To add a new watchable resource, add its stem → resource name entry
to `_STEM_TO_RESOURCE` and handle the resource name in the frontend
hook's `RESOURCE_TO_QUERY` map.

## Org-mode parser notes

The parser in `org/parser.py` produces a tree of `Heading` objects.
Each heading tracks a `dirty: bool` flag. The writer uses the original
`raw_lines` for clean headings and reconstructs text for dirty ones,
preserving all formatting that OmniControl did not touch.

Known keywords (task states) must be passed to `parse_org_file` so
the parser can identify `keyword title` headings correctly. The org
backend resolves keywords from `settings.yaml` at startup.

## Frontend development

```bash
cd frontend
pnpm dev        # dev server on :5173, proxies /api and /ws to :8765
pnpm build      # production build to frontend/dist/
pnpm preview    # serve the production build locally
```

The proxy is configured in `vite.config.ts`. Start `oc serve` first
so the backend is available.

### TanStack Query conventions

- `staleTime: 30_000` by default; active timer uses `refetchInterval: 5_000`.
- After any mutation, `invalidateQueries` is called for the affected
  query key so data refetches automatically.
- WebSocket events trigger the same invalidation without polling.

### Adding a new domain to the frontend

1. Add fetch functions to `src/api/client.ts`.
2. Add hooks to `src/hooks/` following the existing pattern.
3. Build components under `src/components/<domain>/`.
4. Add the resource name to `RESOURCE_TO_QUERY` in `useWebSocket.ts`.

## Running the full stack locally

```bash
# Backend (terminal 1)
source .venv/bin/activate
oc serve --reload

# Frontend (terminal 2)
cd frontend
pnpm dev
```

API docs: `http://localhost:8765/docs`
Frontend: `http://localhost:5173`
