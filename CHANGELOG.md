# Changelog

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
