# Kaisho Gap Analysis

Assessment of the current codebase against the hybrid
monetization strategy (Option C from MONETIZATION.md).

Date: 2026-04-07


## 1. Current Feature Inventory

Everything below is implemented and working.

### Core (always free)

| Feature                                 | CLI                     | API                        | Frontend      |
|-----------------------------------------|-------------------------|----------------------------|---------------|
| Tasks (kanban, states, tags, drag-drop) | `kai task`              | `/api/kanban/*`            | KanbanView    |
| Time tracking (start, stop, book)       | `kai clock`             | `/api/clocks/*`            | ClockView     |
| Customer management                     | `kai customer`          | `/api/customers/*`         | CustomersView |
| Contracts and budgets                   | `kai contract`          | via customers              | CustomerCard  |
| Inbox (capture, process)                | `kai inbox`             | `/api/inbox/*`             | InboxView     |
| Dashboard (stats, calendar)             | `kai briefing`          | `/api/dashboard/*`         | DashboardView |
| Notes                                   | --                      | `/api/notes/*`             | NotesView     |
| AI advisor (Ollama, BYOK)               | `kai ask`               | `/api/advisor/*`           | AdvisorView   |
| Tags and task states config             | `kai tag`, `kai config` | `/api/settings/*`          | SettingsView  |
| Profiles (create, switch, delete)       | `kai profiles`          | `/api/settings/profiles/*` | SettingsView  |
| Theme toggle (light/dark)               | --                      | --                         | App.tsx       |

### Premium candidates (to be gated)

| Feature                               | CLI           | API                | Frontend      |
|---------------------------------------|---------------|--------------------|---------------|
| Cron jobs (scheduled automation)      | `kai cron`    | `/api/cron/*`      | CronView      |
| Knowledge base (viewer, search)       | `kai kb`      | `/api/knowledge/*` | KnowledgeView |
| GitHub integration (issues, projects) | `kai gh`      | `/api/github/*`    | GitHubView    |
| YouTube transcript extraction         | `kai youtube` | --                 | --            |

### Infrastructure

| Component                                      | Status  |
|------------------------------------------------|---------|
| Multiple profiles per instance                 | Working |
| Pluggable backends (org, md, json, sql)        | Working |
| WebSocket real-time updates                    | Working |
| File watcher (auto-reload on external changes) | Working |
| CORS (configurable via env)                    | Working |


## 2. Tier Mapping

Based on MONETIZATION.md Option C (Hybrid).

| Feature                      | Free | Personal EUR 5/mo | Pro EUR 19/mo |
|------------------------------|------|-------------------|---------------|
| Tasks, kanban, drag-drop     | Yes  | Yes               | Yes           |
| Time tracking, booking       | Yes  | Yes               | Yes           |
| Customer management          | Yes  | Yes               | Yes           |
| Contracts, budgets           | Yes  | Yes               | Yes           |
| Inbox capture                | Yes  | Yes               | Yes           |
| Dashboard, calendar          | Yes  | Yes               | Yes           |
| Notes                        | Yes  | Yes               | Yes           |
| AI advisor (Ollama/BYOK)     | Yes  | Yes               | Yes           |
| Web dashboard                | Yes  | Yes               | Yes           |
| CLI (`kai`)                  | Yes  | Yes               | Yes           |
| Single profile               | Yes  | Yes               | Yes           |
| Cron jobs / automation       | --   | Yes               | Yes           |
| Knowledge base search        | --   | Yes               | Yes           |
| GitHub integration           | --   | Yes               | Yes           |
| Multiple profiles            | --   | Yes               | Yes           |
| Auto-updates                 | --   | Yes               | Yes           |
| Email support                | --   | Yes               | Yes           |
| Commercial use license       | --   | --                | Yes           |
| Claude AI token pack (1M/mo) | --   | --                | Yes           |
| Priority support             | --   | --                | Yes           |
| Early access                 | --   | --                | Yes           |
| Company invoice with VAT     | --   | --                | Yes           |


## 3. Implementation Gaps

### Phase 1: License Key System (weeks 1-2)

Revenue from day 1. No desktop app needed yet. License key
unlocks features in the existing web dashboard.

| Component                          | Status  | Effort   | Files                             |
|------------------------------------|---------|----------|-----------------------------------|
| License key storage in user.yaml   | Missing | 2h       | `kaisho/config.py`                |
| `kai activate <key>` CLI command   | Missing | 4h       | new `kaisho/cli/license.py`       |
| JWT license validation (local)     | Missing | 4h       | new `kaisho/services/license.py`  |
| `is_licensed(tier)` gate function  | Missing | 2h       | `kaisho/services/license.py`      |
| Feature gate decorator for routers | Missing | 4h       | `kaisho/api/routers/*.py`         |
| Gate cron endpoints                | Missing | 1h       | `kaisho/api/routers/cron.py`      |
| Gate knowledge endpoints           | Missing | 1h       | `kaisho/api/routers/knowledge.py` |
| Gate GitHub endpoints              | Missing | 1h       | `kaisho/api/routers/github.py`    |
| Gate multiple profiles             | Missing | 2h       | `kaisho/api/routers/settings.py`  |
| Settings UI: license key field     | Missing | 3h       | `SettingsView.tsx`                |
| Frontend: feature gate checks      | Missing | 4h       | various components                |
| Frontend: upgrade prompts          | Missing | 4h       | new `UpgradeBanner.tsx`           |
| Stripe Checkout page               | Missing | 8h       | `product/website/` or separate    |
| Stripe webhook (JWT generator)     | Missing | 8h       | new endpoint or serverless fn     |
| **Subtotal**                       |         | **~44h** |                                   |

Dependencies: `pyjwt` (Python), Stripe account, signing key pair.

### Phase 2: Tauri Desktop App (weeks 3-5)

For non-technical users who want a native app experience.

| Component                          | Status  | Effort   | Files                                 |
|------------------------------------|---------|----------|---------------------------------------|
| Tauri v2 project scaffold          | Missing | 4h       | `desktop/src-tauri/`                  |
| Sidecar launcher (start kai serve) | Missing | 8h       | `desktop/src-tauri/src/main.rs`       |
| Python bundling (PyInstaller)      | Missing | 8h       | `scripts/build-sidecar.sh`            |
| Auto-update (GitHub Releases)      | Missing | 8h       | `tauri.conf.json` updater config      |
| macOS code signing + notarize      | Missing | 4h       | CI config, Apple Developer acct       |
| Windows code signing               | Missing | 4h       | CI config, cert purchase              |
| CI/CD (GitHub Actions)             | Missing | 8h       | `.github/workflows/build-desktop.yml` |
| App icons from kaisho-logo.svg     | Missing | 2h       | `desktop/src-tauri/icons/`            |
| **Subtotal**                       |         | **~46h** |                                       |

Dependencies: Rust toolchain, Apple Developer ($99/yr),
Windows code signing cert ($200-400/yr).

### Phase 3: Hosted Tier (month 2-3)

Only if demand from Phase 1/2 justifies it.

| Component                                      | Status  | Effort   | Files                          |
|------------------------------------------------|---------|----------|--------------------------------|
| Dockerfile                                     | Missing | 4h       | `Dockerfile`                   |
| Docker Compose (dev)                           | Missing | 2h       | `docker-compose.yml`           |
| Deploy script (container + volume + subdomain) | Missing | 16h      | `scripts/deploy.sh`            |
| Reverse proxy config (Caddy/Traefik)           | Missing | 4h       | `deploy/Caddyfile`             |
| Stripe subscription management                 | Missing | 16h      | serverless or backend endpoint |
| Usage tracking (AI tokens)                     | Missing | 8h       | middleware + DB                |
| Monitoring (uptime, disk, memory)              | Missing | 8h       | Prometheus/Grafana or simple   |
| Daily backup automation                        | Missing | 4h       | cron + volume snapshots        |
| CORS from environment variable                 | Missing | 1h       | `kaisho/api/app.py`            |
| **Subtotal**                                   |         | **~63h** |                                |

### Phase 4: AI Token Proxy (month 3-6)

Needed for Pro tier AI features without BYOK.

| Component                        | Status  | Effort   | Files                 |
|----------------------------------|---------|----------|-----------------------|
| Token balance tracking per user  | Missing | 8h       | DB table + service    |
| API gateway (proxy to Anthropic) | Missing | 16h      | serverless or FastAPI |
| Usage metering + monthly reset   | Missing | 8h       | cron job              |
| Overage handling                 | Missing | 4h       | config + billing      |
| **Subtotal**                     |         | **~36h** |                       |


## 4. Codebase Health Issues

Issues that affect monetization readiness but are not
feature gaps.

| Issue                                        | Impact                   | Effort |
|----------------------------------------------|--------------------------|--------|
| In-memory session storage (lost on restart)  | Auth breaks on deploy    | 3h     |
| `os.environ` for user context (process-wide) | Concurrent request bugs  | 1w     |
| Tokens are base64, not signed JWT            | Can be forged            | 4h     |
| CORS hardcoded to localhost                  | Blocks hosted deployment | 1h     |
| "omnicontrol" references in docs/            | Confusing for users      | 2h     |
| Stale paths in product/ docs                 | Incorrect references     | 1h     |


## 5. Recommended Sequence

```
Week 1-2:  Phase 1 (license key system)
           - Backend: license service, gate decorator
           - CLI: kai activate
           - Frontend: license field, upgrade prompts
           - Stripe: checkout page, webhook

Week 3-5:  Phase 2 (Tauri desktop app)
           - Tauri scaffold, sidecar, auto-update
           - CI/CD for macOS/Windows/Linux builds
           - Code signing

Month 2-3: Phase 3 (hosted tier, if demand)
           - Dockerfile, deploy automation
           - Stripe subscriptions
           - Monitoring, backups

Month 3-6: Phase 4 (AI proxy, if Pro demand)
           - Token tracking, API gateway
           - Usage metering
```


## 6. Open Questions

Carried from MONETIZATION.md, still unresolved:

1. Should the free tier include the web dashboard or CLI
   only? Current code serves the dashboard to all users.
   Gating the entire dashboard increases conversion pressure
   but may alienate open-source users.

2. EUR or USD pricing? EUR is natural for a European company.
   Recommendation: show EUR with "(~$X USD)" note.

3. Annual discount (18% Personal, 35% Pro): is that enough
   incentive for annual commitments?

4. AI token budget: 1M input tokens/month (~30-40 advisor
   queries). Sufficient for target user? Allow overage or
   hard cap?

5. License enforcement: honor system (local JWT, no server
   call) or monthly server validation?

6. Desktop app or web-first for Phase 1? The MONETIZATION.md
   recommends web-first (Phase 1 = just license keys in the
   existing `kai serve` flow), desktop later.
