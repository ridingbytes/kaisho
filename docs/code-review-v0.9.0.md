# Code Review: v0.9.0

Comprehensive review across the Kaisho ecosystem (kaisho,
kaisho-cloud, kaisho-mode). Findings organized by severity
and category. Items marked with a checkbox are actionable
for future sessions.

## Current State

| Metric | Value |
|--------|-------|
| Backend tests | 258 passing |
| Test coverage | 51% |
| Flake8 errors | 0 |
| TypeScript errors | 0 |
| Frontend build | Clean |

## Security

### Critical

None found. The codebase is security-conscious:
- Path traversal protection in knowledge.py via `_safe_path()`
- No SQL injection risk (Supabase ORM in cloud, org files locally)
- No shell injection (uses `shlex.split` + `call-process` arrays)
- API keys never returned by tool handlers
- CLI router blocks dangerous commands (`serve`, `profile`, `config`)

### High

- [ ] **kaisho-cloud: API key lookup scans all users on cold cache.**
  `middleware.js:64-74` loads up to 200 users and bcrypt-compares
  each one. Add an indexed `key_prefix` column to enable direct
  lookup. Currently mitigated by the SHA-256 fast cache (5-min TTL).

- [ ] **kaisho-mode: shell injection in `kaisho-run-command`.**
  `kaisho-mode.el:643` concatenates user input into a `compile`
  shell command without escaping. Use `shell-quote-argument` to
  escape args. Low real-world risk (personal tool, interactive
  only) but should be fixed for correctness.

### Medium

- [ ] **CORS allows localhost ports broadly.**
  `kaisho/api/app.py` allows 5173, 5174, 3000, 8765. In production
  (desktop app), only 8765 is needed. Consider tightening for the
  bundled app.

- [ ] **Broad exception handlers in 8 locations.**
  Files: `cli/convert.py:66`, `api/routers/cron.py:229`,
  `api/routers/advisor.py:169`, `services/knowledge.py:160`,
  `cron/tools.py:959`, `cron/scheduler.py:95,402,427`.
  Most are intentional (tool dispatch, scheduler resilience) but
  `services/knowledge.py:160` should catch `(ImportError, OSError)`
  instead of bare `Exception`.

## Test Coverage Gaps

Current coverage: **51%**. Key untested areas:

### 0% Coverage (no tests at all)

- [ ] `kaisho/mcp/server.py` -- MCP server creation and tool
  registration. Add integration test that creates the server and
  verifies tool count matches tier filtering.
- [ ] `kaisho/services/cloud_ws.py` -- WebSocket sync client.
  Hard to unit test (network dependent). Add mock-based test for
  message parsing.
- [ ] `kaisho/services/recurring_tasks.py` -- Recurring task
  creation. Straightforward to test with mock backend.
- [ ] `kaisho/cron/executor.py` (11%) -- Prompt loading, model
  dispatch, tool calling loop. Test prompt template rendering and
  model string parsing.

### Low Coverage (<40%)

- [ ] `kaisho/cron/tools.py` (14%) -- Tool handler functions.
  Each handler is a thin wrapper around backend methods. Test the
  dispatch table and a representative sample of handlers.
- [ ] `kaisho/services/advisor.py` (13%) -- AI advisor loop.
  Test `_parse_model()` routing and context assembly (not the
  actual LLM calls).
- [ ] `kaisho/services/github.py` (21%) -- GitHub API client.
  Mock `urllib.request` and test issue/PR parsing.
- [ ] `kaisho/services/notes.py` (33%) -- Note CRUD. Add tests
  similar to existing inbox/task tests.
- [ ] `kaisho/services/knowledge.py` (36%) -- KB operations.
  Test file tree, search, PDF extraction, path traversal
  blocking.
- [ ] `kaisho/services/inbox.py` (37%) -- Inbox CRUD. Add
  capture, promote, move tests.
- [ ] `kaisho/services/customers.py` (37%) -- Customer/contract
  CRUD. Test budget calculations.

### Missing Test Types

- [ ] **API endpoint tests**: Only some routers have endpoint
  tests. Missing: advisor, cron, github, cloud_sync, knowledge,
  notes, dashboard, backup, settings_ai, version, ws.
- [ ] **Frontend tests**: Zero tests. Consider adding Vitest for
  critical utilities (profileStorage, formatting, filterMatch).
- [ ] **kaisho-cloud tests**: Zero tests. Priority: auth
  middleware, sync merge logic, Stripe webhook handlers.
- [ ] **kaisho-mode tests**: Zero ERT tests. Low priority (small
  codebase, interactive tool).

## Consistency

### Naming

- [x] Python: snake_case, 80-col, double quotes -- consistent
- [x] TypeScript: camelCase, double quotes -- consistent
- [x] API routes: kebab-case prefixes -- consistent
- [ ] **Inconsistency: `tool_defs.py` uses `item_type` for inbox
  but `type` in other contexts.** Minor, not worth changing (would
  break existing prompts).

### Error Handling

- [x] Backend services return dicts; API routers raise HTTPException
- [x] `execute_tool()` never raises (returns `{"error": ...}`)
- [ ] **Some routers return error dicts instead of raising.**
  `cli.py:run_command` returns `{"error": ...}` with status 200
  instead of raising HTTPException. This is intentional (CLI
  output format) but inconsistent with other routers.

### Import Organization

- [x] Imports at top of module (except lazy imports for heavy deps)
- [x] No circular imports detected
- [ ] **`cron/tools.py` uses lazy `_backend()` import.** Correct
  (avoids circular), but the pattern should be documented.

## Maintainability

### Dead Code

- [ ] **`docs/mcp-integration-plan.md`** is superseded by the
  actual implementation and `docs/integrations/mcp.md`. Can be
  removed or moved to an archive.

### Complexity

- [ ] **`services/advisor.py` is 750 lines** with model dispatch,
  prompt assembly, tool calling loop, and multiple provider
  handlers. Consider splitting into `advisor/dispatch.py`,
  `advisor/prompt.py`, `advisor/providers.py`.
- [ ] **`cron/tools.py` is 1000+ lines** with 40 handler
  functions. Consider grouping handlers by domain (tasks, clocks,
  kb, etc.) in separate modules, imported into a dispatch dict.
- [ ] **`services/clocks.py` is 1365 lines.** Contains both
  org-mode parsing and business logic. The org parsing should
  live in the org backend.

### TODO Comments

- [ ] `services/advisor.py:248` -- "All skills are injected into
  every prompt." This should be addressed: filter skills by
  relevance or let the user select which skills to include.

## kaisho-cloud Specific

### Architecture (Good)

- Express + Supabase + Stripe + Resend + OpenRouter
- Clean separation: routes, middleware, validation, db
- Zod validation on all request bodies
- Field allowlisting for update operations
- Rate limiting on auth endpoints
- Plan enforcement middleware

### Issues

- [ ] **No tests.** Priority items: auth middleware, sync merge
  logic, Stripe webhook idempotency.
- [ ] **API key lookup O(n).** Add indexed `key_prefix` column.
  Already has a TODO comment.
- [ ] **AI usage metering is per-month only.** No daily/hourly
  granularity for abuse detection.
- [ ] **No CI/CD for tests.** Only has deploy workflow (FTP push).

## kaisho-mode Specific

### Architecture (Good)

- Single-file Emacs package, clean structure
- Uses `call-process` for CLI (safe, no shell injection)
- WebSocket integration for live timer updates
- TTL-based result cache

### Issues

- [ ] **Shell injection in `kaisho-run-command`.** Fix with
  `shell-quote-argument`.
- [ ] **No ERT tests.** Low priority but would catch regressions.
- [ ] **No CI.** No GitHub Actions workflow.

## Recommendations for Next Sessions

### Priority 1 (Security + Correctness)

1. Fix kaisho-mode shell injection
2. Add `key_prefix` indexed column in kaisho-cloud
3. Narrow `except Exception` in knowledge.py

### Priority 2 (Test Coverage)

4. Add tests for MCP server (integration test)
5. Add tests for recurring_tasks, notes, inbox, customers
6. Add API endpoint tests for untested routers
7. Add basic kaisho-cloud tests (auth, sync)

### Priority 3 (Architecture)

8. Split advisor.py into focused modules
9. Split cron/tools.py by domain
10. Extract clocks.py org parsing to backend

### Priority 4 (Features)

11. Advisor skill filtering (not inject all into every prompt)
12. AI usage daily granularity in kaisho-cloud
13. Frontend tests with Vitest
14. CI for kaisho-cloud and kaisho-mode
