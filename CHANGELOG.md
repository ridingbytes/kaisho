# Changelog

## 0.6.4

- Updated documentation and in-app help panels
- Cloud Sync and Import help in settings panel
- Website format examples match actual org/md structure
- Consolidated planning docs, removed duplicates

## 0.6.3

- Code review: fix path traversal, iCal UID collisions,
  SSL init, AI endpoint crashes, dead code
- Consistent local_now() across all services
- Flake8 clean (0 errors), lint step in CI
- 30 new FastAPI TestClient tests (244 total)
- Updated documentation across all repos
- Security: WS auth via first-message, rate-limited
  password reset, paid plan enforcement on sync
- Accessibility: ARIA roles, keyboard nav, focus trapping

## 0.6.2

- Fix SSL globally for all HTTPS requests in desktop app
- Reject cloud connect on free plan
- Enforce paid plan on all cloud sync endpoints

## 0.6.1

- Fix cloud sync: SSL certs for PyInstaller bundle
- Eye toggle to verify API key in connect form
- Better error messages for cloud connection failures

## 0.6.0

- Resume button visible on all clock entries (not just today)
- Hardcode cloud.kaisho.dev URL (no manual URL input)
- Password reset flow in mobile PWA
- Markdown rendering + syntax highlighting in PWA advisor
- Advisor templates populate input (don't auto-send)
- Stop button for in-flight advisor requests
- Redesigned PWA home screen icon

## 0.5.10

- Empty AI settings on fresh profiles (no pre-filled URLs)
- Rewrite build workflow for reliable auto-updater

## 0.5.9

- Fix clock import: preserve original start/end times
- Add syntax highlighting for code blocks (rehype-highlight)
- Fix updater workflow: collect sig files correctly
- URL-encode contract names in API client

## 0.5.8

- Fix settings endpoint hidden by SPA catch-all
- Fix input height mismatches in settings selects
- Remove unused update channel selector
- Code cleanup: remove unused variables, fix state
  ordering, fix import write-on-no-change bug

## 0.5.7

- Fix data directory: always use ~/.kaisho in desktop app
- Hide JSON and SQL backends from UI (org + markdown only)
- Better API error reporting (detect non-JSON responses)
- Fix auto-updater latest.json generation

## 0.5.6

- Fix Tags & Types panel on fresh/reset profile
- Create profile directory on startup if missing
- Fix auto-updater: generate latest.json correctly
- Reset local preferences button in Settings
- Settings endpoint: robust defaults for all fields

## 0.5.5

- Fix Tags & Types settings panel (stuck on Loading)
- Fix 500 error on AI models endpoint without providers
- Show version number in header bar
- Remove Intel Mac from build matrix (Apple Silicon only)

## 0.5.4

- Fix updater: allow IPC from localhost webview
- External links open in system browser (not webview)
- Automatic update notifier on app startup
- What's New dialog shows only latest version
- Import: upsert by ID (no duplicates on re-import)
- Import: auto-populate task states and tags in settings
- Hide advisor model selector when no AI configured
- Disable cron enable toggle without a model
- Narrow exception handling to specific types

## 0.5.3

- Cloud onboarding: pricing links, feature overview, spam email hint
- Top-bar cloud plan badge and mobile app link when connected
- Dismissable cloud nudge banner (14-day cooldown)
- Advisor, Cron, GitHub panels always visible in sidebar
- Empty-state hints when no AI provider or GitHub token configured
- Ollama API Key moved to Cloud API Keys section
- Cron Run button disabled when no model configured
- Fix updater ACL permissions for in-app updates
- Fix version display (bundle pyproject.toml in sidecar)
- Claude models only shown when API key is set

## 0.4.0

- Advisor tool calling: kai CLI commands via Kaisho AI
- Full codebase refactoring for maintainability
- API key cache invalidated on key rotation (security fix)
- Zod validation schemas on all AI endpoints
- Shared utility modules (formatElapsed, time formatters)
- Plan cache cleared on Stripe webhook (no stale plan)
- OpenRouter key + token quota extracted as middleware
- Stripe client reused from module-level instance
- Silent catch blocks replaced with console.warn/log
- Dead code removed (double write_output, unused functions)
- Exception chaining in claude_cli timeout
- Consistent datetime.now() vs local_now() usage
- Imports sorted and deduplicated throughout

## 0.3.2

- Fix desktop app startup: PyInstaller-aware path resolution
- Random port selection to avoid conflicts
- Simplify Kaisho AI: single completion, no tool calls
- Default crons (daily-briefing, project-update) use Kaisho AI
- Token budget for agentic loop (50K max per run)

## 0.3.1

- Fix desktop app: set SERVE_FRONTEND=true for sidecar
- Fix Windows build: PowerShell reads BUILD_TARGET from env
- Batch sync/apply: single SELECT + batch INSERT (20s to 3s)
- Auth cache: SHA-256 fast cache (5 min TTL, skips bcrypt)
- Plan cache: 60s TTL eliminates Supabase round-trip per request
- WebSocket refactoring: error logging, reconnect jitter,
  safe disconnect, consistent async broadcasts
- Mobile: editable start time and duration in entry editor
- Mobile: hash-based routing (stays on tab after reload)
- Mobile: full-screen edit modal for iOS compatibility
- HTTP timeout increased to 60s for initial sync
- Sync cursor properly saved after successful push
- Code cleanup: remove dead code, fix imports, update docs

## 0.3.0

- Kaisho AI with full agentic tool calling through OpenRouter
- Real-time WebSocket sync replaces polling (mobile + desktop)
- Per-job Kaisho AI toggle for cron jobs
- AI token usage meter in Cloud Sync settings
- Security guardrails for cloud tool execution
- Hide advisor/cron/GitHub panels when not configured
- Timezone fix for cloud sync (UTC conversion)
- System scheduler jobs preserved during job sync
- German identifiers renamed to English throughout

## 0.2.0

- Bidirectional cloud sync with last-writer-wins conflict resolution
- Mobile PWA with dashboard, calendar navigation, and entry editing
- AI gateway with OpenRouter integration and token metering
- Desktop app with auto-update (stable and develop channels)
- Customer picker with free-text and auto-create
- Offline mutation queue for mobile
- ConfirmPopover for all destructive actions
- Backend-agnostic sync (org, markdown, JSON, SQL)
- Single-profile sync enforcement
- Disconnect flow that wipes cloud entries
- Windows path compatibility fix

## 0.1.0

- Initial release
- Time tracking with start/stop timers and quick-booking
- Kanban board with drag-and-drop and custom columns
- Customer and contract management with budget tracking
- Invoicing with CSV export
- Dashboard with daily, weekly, and monthly views
- AI assistant with Ollama, Claude, and OpenRouter support
- Pluggable storage backends (org-mode, Markdown, JSON, SQL)
- Multi-profile support
- Emacs integration (kaisho-mode)
- CLI with all features accessible as subcommands
- GitHub integration for issue tracking
- Keyboard shortcuts
- Knowledge base with full-text search
