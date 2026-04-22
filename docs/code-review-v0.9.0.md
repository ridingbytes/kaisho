# Code Review: v0.9.0

Comprehensive review across the Kaisho ecosystem (kaisho,
kaisho-cloud, kaisho-mode). Findings organized by severity
and category. Checked items were fixed in this session.

## Current State

| Metric | Value |
|--------|-------|
| Backend tests | 258 passing |
| Test coverage | 51% |
| Flake8 errors | 0 |
| TypeScript errors | 0 |
| Frontend build | Clean |

## Fixes Applied This Session

- [x] **Cron write limiter broken**: `_WRITE_TOOLS` listed wrong
  names (`capture_inbox` instead of `add_inbox_item`,
  `quick_book` instead of `book_time`). Also added missing
  write tools (add_note, update_note, etc.).
- [x] **`execute_cli` tool had no command blocklist**: AI models
  could call `serve`, `profiles delete`, `config` via the tool.
  Added `_CLI_BLOCKED` set matching the API router's blocklist.
- [x] **Layer violation**: `cron/tools.py` imported from
  `api.routers.dashboard`. Extracted `period_range`,
  `billable_contracts`, `is_billable` into new
  `services/time_insights.py`. Both dashboard router and tool
  dispatcher now import from the service.
- [x] **Duplicated AI helpers**: `_parse_model`, `_http_post`,
  `_extract_claude_text` existed identically in both
  `services/advisor.py` and `cron/executor.py`. Extracted to
  shared `kaisho/ai_utils.py`.
- [x] **Broad exception handler in knowledge.py**: Changed
  `except Exception` to `except (ImportError, OSError, ValueError)`
  in `_pypdf_extract`.
- [x] **CORS wildcard regex removed**: `allow_origin_regex` matched
  any localhost port, undermining the origin allowlist.

## Security

### Critical

None remaining.

### High

- [ ] **No API authentication.** The local server binds to
  `0.0.0.0` by default with no auth. Any process on the network
  can access all endpoints. Consider binding to `127.0.0.1` by
  default, or adding a startup-generated bearer token.

- [ ] **kaisho-cloud: API key lookup scans all users on cold
  cache.** `middleware.js:64-74` loads up to 200 users and
  bcrypt-compares each. Add an indexed `key_prefix` column.
  Mitigated by SHA-256 fast cache (5-min TTL).

- [ ] **kaisho-mode: shell injection in `kaisho-run-command`.**
  `kaisho-mode.el:643` concatenates user input into a `compile`
  shell command. Fix with `shell-quote-argument`.

### Medium

- [ ] **API keys stored in plaintext YAML.** Cloud sync key,
  GitHub token, Claude/OpenRouter/OpenAI keys in
  `settings.yaml`. Consider OS keychain (keyring library) or
  at minimum 0600 file permissions.

- [ ] **Broad exception handlers in 5 remaining locations.**
  `cron/scheduler.py:95,402,427`, `api/routers/cron.py:229`,
  `api/routers/advisor.py:169`. Most are intentional (scheduler
  resilience, thread error containment) but worth reviewing.

- [ ] **Backup restore path validation.** `services/backup.py`
  checks for `..` in member names but should use the same
  `_safe_path` pattern as the knowledge service for robustness.

## Test Coverage Gaps

### 0% Coverage (no tests)

- [ ] `kaisho/mcp/server.py` -- MCP server
- [ ] `kaisho/services/cloud_ws.py` -- WebSocket sync client
- [ ] `kaisho/services/recurring_tasks.py` -- Recurring tasks
- [ ] `kaisho/cron/executor.py` (11%) -- Prompt loading, model
  dispatch, tool calling loop

### Low Coverage (<40%)

- [ ] `services/advisor.py` (13%) -- AI advisor loop
- [ ] `cron/tools.py` (14%) -- Tool handlers
- [ ] `services/github.py` (21%) -- GitHub API client
- [ ] `services/notes.py` (33%) -- Note CRUD
- [ ] `services/knowledge.py` (36%) -- KB operations
- [ ] `services/inbox.py` (37%) -- Inbox CRUD
- [ ] `services/customers.py` (37%) -- Customer/contract CRUD

### Missing Test Types

- [ ] API endpoint tests for: advisor, cron, github, cloud_sync,
  knowledge, notes, dashboard, backup, settings_ai, version, ws
- [ ] Frontend tests (Vitest for profileStorage, formatting)
- [ ] kaisho-cloud tests (auth, sync merge, Stripe webhooks)
- [ ] kaisho-mode ERT tests

## Consistency

### Fixed

- [x] Duplicated `_parse_model` across advisor.py / executor.py
- [x] Duplicated `_http_post` across advisor.py / executor.py
- [x] Duplicated `_extract_claude_text` across both files

### Remaining

- [ ] **Duplicated AI credential gathering.** The pattern of
  reading AI settings and constructing provider kwargs appears
  in `cron/scheduler.py:47-85`, `api/routers/cron.py:194-225`,
  and `cron/tools.py:910-954`. Create a shared
  `build_ai_kwargs(settings_data)` function.

- [ ] **`ask()` takes 18 parameters.** Group AI provider
  credentials into a dataclass and pass a single config object.
  Same for `execute_job()` (15 params) and `_dispatch_prompt()`
  (15 params).

## Maintainability

### Fixed

- [x] Layer violation: tools imported from API router
- [x] Broken write limiter tool names in cron executor

### Remaining

- [ ] **`services/advisor.py` is 740 lines.** Split into
  `advisor/dispatch.py`, `advisor/prompt.py`,
  `advisor/providers.py`.
- [ ] **`cron/tools.py` is 1000+ lines.** Group handlers by
  domain in separate modules.
- [ ] **`services/clocks.py` is 1365 lines.** Extract org
  parsing to the org backend.
- [ ] **Module-level mutable `_state` in executor.py.** The write
  counter is shared across concurrent cron jobs. Pass as a
  parameter through the agentic loop.
- [ ] **Advisor skills all injected into every prompt**
  (`advisor.py:248` TODO). Filter by relevance or let the user
  select.

## kaisho-cloud

### Strengths

- Strong auth (JWT + API key + bcrypt + SHA-256 cache)
- Zod validation on all request bodies
- Field allowlisting for updates
- Rate limiting on auth endpoints
- Stripe webhook signature verification + idempotency
- CORS restricted to single origin

### Issues

- [ ] No tests. Priority: auth middleware, sync merge, webhooks.
- [ ] API key lookup O(n). Add indexed key_prefix column.
- [ ] AI usage metering per-month only (no daily granularity).
- [ ] `console.warn()` instead of `logger.warn()` in auth.js.
- [ ] No CI for tests (only deploy workflow).

## kaisho-mode

### Strengths

- Single-file package, clean structure
- `call-process` for CLI (no shell injection)
- WebSocket integration for live timer
- Comprehensive README

### Issues

- [ ] Shell injection in `kaisho-run-command` via `compile()`.
- [ ] No ERT tests.
- [ ] No CI workflow.

## Recommendations for Next Sessions

### Priority 1 (Security)

1. Bind API server to 127.0.0.1 by default
2. Fix kaisho-mode shell injection
3. Add key_prefix column in kaisho-cloud
4. Apply _safe_path pattern to backup restore

### Priority 2 (Test Coverage)

5. Tests for MCP server, recurring_tasks, notes, inbox
6. Tests for advisor _parse_model, context assembly
7. API endpoint tests for untested routers
8. Basic kaisho-cloud tests (auth, sync)

### Priority 3 (Architecture)

9. Shared `build_ai_kwargs()` function
10. Group advisor.py function params into config dataclass
11. Split advisor.py, tools.py, clocks.py into modules
12. Fix shared mutable write counter in executor

### Priority 4 (Features / Polish)

13. Advisor skill filtering
14. Frontend tests (Vitest)
15. CI for kaisho-cloud and kaisho-mode
16. AI usage daily granularity
