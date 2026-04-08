# Kaisho Monetization Concept

Comprehensive comparison of monetization strategies with
a concrete recommendation.


## Option A: Open Source + Hosted Instance

### How it works

The full app is open source on GitHub. Anyone can
self-host. Paid tiers provide hosted infrastructure
or AI token budgets.

### Tiers

| Tier        | Price  | What they get                                                                                                                                                   |
|-------------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Open Source | $0     | Everything. CLI + Web UI. All features. Ollama locally. BYOK for Claude/OpenRouter. Self-hosted.                                                                |
| Hosted      | $9/mo  | We run a Docker instance for the customer. Daily backups. Custom subdomain (name.kaisho.dev). Customer provides own AI API key.                                 |
| Hosted + AI | $19/mo | Hosted instance + Claude Sonnet access. Token budget: 2M input + 200K output tokens/month (~60-80 advisor queries). Overage: $5 per additional 1M input tokens. |

### Revenue math

| Scenario             | Users                     | MRR    | ARR    |
|----------------------|---------------------------|--------|--------|
| Early (6 months)     | 30 hosted, 10 hosted+AI   | $460   | $5.5K  |
| Traction (12 months) | 150 hosted, 50 hosted+AI  | $2,300 | $27.6K |
| Growth (24 months)   | 500 hosted, 200 hosted+AI | $8,300 | $99.6K |

### Cost structure per customer

| Component                     | Hosted $9       | Hosted+AI $19   |
|-------------------------------|-----------------|-----------------|
| VPS (shared, ~256MB RAM)      | ~$2/mo          | ~$2/mo          |
| Backup storage                | ~$0.50/mo       | ~$0.50/mo       |
| Claude API (2M in + 200K out) | $0              | ~$8/mo          |
| Stripe fees (2.9% + $0.30)    | ~$0.56          | ~$0.85          |
| **Margin**                    | **$5.94 (66%)** | **$7.65 (40%)** |

### Pros

- No upfront development beyond what exists
- Each customer is an isolated Docker container
- Scales linearly: more customers = more containers
- Open source drives organic growth
- AI cost is bounded by token budget per customer
- Path to multi-tenant SaaS later if demand justifies it

### Cons

- Manual customer provisioning initially (automate later)
- Each container uses server resources (256MB+ RAM)
- At 500 customers, need ~128GB RAM across servers
- No offline capability for hosted customers
- Revenue tied to recurring infrastructure cost

### Technical requirements

- Reverse proxy (Caddy/Traefik) for subdomain routing
- Deploy script: create container, volume, subdomain
- Stripe Checkout for subscriptions
- Usage tracking for AI token consumption
- Monitoring (uptime, disk, memory per container)

### Timeline to revenue: 1-2 weeks


---


## Option B: Desktop App with License Key

### How it works

Package Kaisho as an Electron (or Tauri) desktop app.
Free version with limited features. Paid license unlocks
full feature set. Auto-update channel delivers new
versions.

### Tiers

| Tier     | Price                   | What they get                                                                                                                            |
|----------|-------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Free     | $0                      | CLI only. No web dashboard. Core task/clock/customer features. Ollama AI. 1 profile.                                                     |
| Personal | EUR 5/mo or EUR 49/yr   | Full app (CLI + desktop UI). All features. Unlimited profiles. Auto-updates. Personal use only.                                          |
| Pro      | EUR 19/mo or EUR 149/yr | Everything in Personal. Commercial use license. Priority support. Early access. AI token pack (1M tokens/mo). Invoice for tax deduction. |

### Revenue math

| Scenario             | Personal | Pro | MRR        | ARR        |
|----------------------|----------|-----|------------|------------|
| Early (6 months)     | 80       | 20  | EUR 780    | EUR 9.4K   |
| Traction (12 months) | 300      | 80  | EUR 3,020  | EUR 36.2K  |
| Growth (24 months)   | 1000     | 300 | EUR 10,700 | EUR 128.4K |
|                      |          |     |            |            |

### Cost structure per customer

| Component              | Personal EUR 5     | Pro EUR 19          |
|------------------------|--------------------|---------------------|
| Infrastructure         | $0                 | $0                  |
| Claude API (1M tokens) | $0                 | ~$4/mo              |
| Stripe fees            | ~EUR 0.45          | ~EUR 0.85           |
| Auto-update CDN        | ~EUR 0.01          | ~EUR 0.01           |
| **Margin**             | **EUR 4.54 (91%)** | **EUR 14.14 (74%)** |

### What the free version includes (CLI only)

- `kai task` — full task management
- `kai clock` — time tracking
- `kai customer` — customer management
- `kai briefing` — morning overview
- `kai inbox` — capture (max 20 items)
- `kai ask` — AI advisor (Ollama only, BYOK)
- No web dashboard
- No cron jobs
- No knowledge base search
- No GitHub integration
- 1 profile only

### What Personal unlocks

- Full web dashboard (desktop app with embedded browser)
- Unlimited inbox items
- Cron/automation jobs
- Knowledge base viewer + search
- GitHub integration
- Multiple profiles
- Auto-update channel
- All future features

### What Pro adds on top

- Commercial use license (company invoice)
- AI token pack: 1M input tokens/month via Claude
- Priority support (email, private GitHub issues)
- Early access to beta features
- Company invoice with VAT for tax deduction

### Feature gating implementation

The license key check can be simple:

1. User buys on kaisho.dev via Stripe
2. Stripe webhook generates a signed license key
   (JWT with email, tier, expiry)
3. User enters key in app: `kai activate <key>` or
   via Settings UI
4. App validates JWT signature locally (no server
   call needed)
5. Features unlock based on tier claim in JWT
6. Key checked on startup + once daily (offline OK
   for 30 days, then nag screen)

No DRM, no phone-home requirement. Honest licensing
for honest users. Pirates will pirate — focus on making
paying easy and worthwhile.

### Electron vs Tauri

|                  | Electron                  | Tauri                |
|------------------|---------------------------|----------------------|
| Bundle size      | ~150MB                    | ~5MB                 |
| RAM usage        | ~200MB                    | ~30MB                |
| Dev effort       | Low (existing React app)  | Medium (Rust bridge) |
| Auto-update      | electron-updater (mature) | tauri-updater (good) |
| Signing/notarize | Well documented           | Well documented      |
| Cross-platform   | Win/Mac/Linux             | Win/Mac/Linux        |

Recommendation: **Tauri**. The frontend is already a
standalone React app. Tauri wraps it with minimal overhead.
The Python backend runs as a sidecar process.

### Pros

- Highest margin (91% on Personal, no infra cost)
- Users own their data (local files, no cloud dependency)
- No server infrastructure to maintain
- Offline-first matches the product philosophy
- Auto-update channel ensures everyone is current
- Commercial license is standard B2B monetization
- Scales infinitely (no per-user server cost)

### Cons

- Electron/Tauri packaging is additional dev work (~2 weeks)
- macOS code signing + notarization ($99/yr Apple Developer)
- Windows code signing (~$200-400/yr certificate)
- Auto-update infrastructure (S3 + CDN, ~$20/mo)
- CLI users may resist a desktop app wrapper
- No control over user environment (Python version, etc.)
- Support burden higher (works on my machine problems)

### Timeline to revenue: 3-4 weeks


---


## Option C: Hybrid (Recommended)

### How it works

Combine the strengths of both. Open source CLI stays
free forever. Revenue comes from two independent channels
that serve different user types.

### Tiers

| Tier            | Price                   | Target                      | Delivery                                                        |
|-----------------|-------------------------|-----------------------------|-----------------------------------------------------------------|
| **Open Source** | $0                      | Developers, tinkerers       | GitHub, pip install                                             |
| **Desktop App** | EUR 5/mo or EUR 49/yr   | Solo freelancers            | Tauri app, auto-update, license key                             |
| **Pro**         | EUR 19/mo or EUR 149/yr | Consultants, small agencies | Desktop app + AI tokens + commercial license + priority support |
| **Hosted**      | EUR 15/mo               | Non-technical freelancers   | We host, they use browser                                       |

### Why this works

1. **Open Source** feeds the top of the funnel. GitHub
   stars, Hacker News, word of mouth. These users never
   pay and that is fine — they are the marketing budget.

2. **Desktop App** captures freelancers who want a
   polished experience without setting up Python, pip,
   and a terminal. One download, it works. EUR 5/mo is
   an impulse purchase for anyone billing EUR 50+/hour.

3. **Pro** captures consultants who need commercial
   licensing, tax invoices, and AI features. EUR 19/mo
   is trivial for a business expense. The AI token pack
   justifies the price jump.

4. **Hosted** is the "I don't want to install anything"
   tier. Added later (Phase 2) when the deploy automation
   is built. EUR 15/mo covers Docker hosting + margin.

### Revenue projections (Hybrid)

| Phase                | OS users | Desktop | Pro | Hosted | MRR        |
|----------------------|----------|---------|-----|--------|------------|
| Launch (3 months)    | 500      | 40      | 10  | 0      | EUR 390    |
| Traction (12 months) | 3000     | 200     | 60  | 30     | EUR 2,590  |
| Growth (24 months)   | 8000     | 800     | 250 | 150    | EUR 11,000 |

### Implementation priority

**Phase 1 — Week 1-2 (Revenue from Day 1):**

Ship the license-key system. No desktop app yet.
License key unlocks features in the existing web
dashboard served by `kai serve`. The "Desktop App" is
simply `kai serve` opening in the browser, but the
license key gates premium features.

What to build:
- Stripe Checkout page on kaisho.dev
- Webhook endpoint that generates signed JWT license key
- `kai activate <key>` CLI command
- Settings UI field for license key
- Feature gate check: `is_pro()` function that reads
  the stored license
- Gate: cron jobs, knowledge base, GitHub integration,
  multiple profiles behind Pro
- All task/clock/customer/inbox features stay free

This gets you revenue without building Electron/Tauri.

**Phase 2 — Week 3-5:**

Package as Tauri desktop app for non-technical users.
Auto-update via GitHub Releases. The app bundles the
Python backend and starts `kai serve` automatically.

**Phase 3 — Month 2-3:**

Add hosted tier. Docker automation, Stripe subscription
for hosted instances. Only if demand from Phase 1/2
indicates non-technical users want this.

**Phase 4 — Month 3-6:**

AI token proxy. A simple API gateway that checks the
user's token balance and proxies requests to Anthropic.
Needed for Pro tier AI features without BYOK.


---


## Comparison Matrix

| Criterion                  | A: Hosted Only    | B: Desktop Only      | C: Hybrid     |
|----------------------------|-------------------|----------------------|---------------|
| Time to first EUR          | 1-2 weeks         | 3-4 weeks            | 1-2 weeks     |
| Margin (Personal)          | 66%               | 91%                  | 91%           |
| Margin (Pro/AI)            | 40%               | 74%                  | 74%           |
| Infra cost at 500 users    | ~EUR 1,200/mo     | ~EUR 20/mo           | ~EUR 200/mo   |
| Scalability                | Linear cost       | Zero marginal cost   | Mostly zero   |
| Matches product philosophy | Partially (cloud) | Yes (local-first)    | Yes           |
| User acquisition           | GitHub → Hosted   | GitHub → App         | GitHub → Both |
| Dev effort (initial)       | Low               | Medium               | Low (Phase 1) |
| Dev effort (total)         | Medium            | Medium               | High          |
| Revenue ceiling (solo dev) | ~EUR 100K ARR     | ~EUR 130K ARR        | ~EUR 130K ARR |
| Risk                       | Server costs grow | Packaging complexity | Complexity    |


---


## Recommendation

**Go with Option C (Hybrid), Phase 1 first.**

Phase 1 requires only:
1. A Stripe Checkout page
2. A JWT license key generator (webhook)
3. A `kai activate` command
4. A feature gate function
5. Gating 4-5 features behind the key

This is 1-2 weeks of work and generates revenue
immediately. No Electron, no Docker hosting, no AI
proxy. Just a license key that unlocks features in
the app people already download from GitHub.

The Desktop App (Phase 2) and Hosted Tier (Phase 3)
come later, driven by demand signals from Phase 1.


---


## Pricing Page Copy (for website)

```
Free & Open Source
  $0 — forever

  Everything you need to manage freelance work.
  Self-hosted, local-first, your data stays yours.

  - Kanban board with custom states
  - Time tracking with customer budgets
  - Inbox capture and processing
  - AI advisor (Ollama, bring your own key)
  - CLI (kai) + Web dashboard
  - Community support

  [Download on GitHub]


Personal
  EUR 5/month or EUR 49/year

  Unlock the full toolkit.

  - Everything in Free
  - Scheduled automation (cron jobs)
  - Knowledge base viewer and search
  - GitHub integration
  - Multiple user profiles
  - Auto-updates
  - Email support

  [Get Personal]


Pro
  EUR 19/month or EUR 149/year

  For professionals and commercial use.

  - Everything in Personal
  - Commercial use license
  - Claude AI included (1M tokens/month)
  - Priority support
  - Early access to new features
  - Company invoice with VAT

  [Get Pro]
```

Note: "Hosted" tier is not shown at launch. Add it
when infrastructure automation is ready (Phase 3).


---


## Open Questions

1. Should the free tier include the web dashboard or
   only CLI? (Current website says "CLI + Web dashboard"
   for free — this reduces conversion pressure.)

2. EUR or USD pricing? EUR is natural for a European
   company, but USD is standard for global SaaS.
   Recommendation: show EUR with "(~$X USD)" note.

3. Annual discount: 49/yr = 18% off vs monthly.
   149/yr = 35% off. Is that enough incentive?

4. AI token budget for Pro: 1M input tokens/month is
   ~30-40 advisor queries with full context. Is that
   enough for the target user? Should overage be
   allowed or hard-capped?

5. License enforcement: honor system (JWT checked
   locally, no phone-home) or server validation
   (requires internet once/month)?
