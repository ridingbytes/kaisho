# Kaisho Website Build Brief

Build a complete product website for Kaisho at
~/develop/kaiho/website/. Single index.html file,
no framework, no build step. Serve with any static
file server.


## What is Kaisho

Kaisho (Kanban + AI + Shell + Organizer) is a self-hosted
productivity system for freelancers and consultants.
CLI-first (`kai`) with a React web dashboard. Manages
tasks (kanban), time tracking, customer budgets, inbox,
knowledge base, GitHub issues, AI advisor, and cron jobs.

- Domain: kaisho.dev
- CLI command: `kai`
- Company: Riding Bytes (also makes SENAITY at senaity.com)
- Business model: open-core. Free self-hosted, paid cloud.


## Design: Graphite Lavender palette

The website must match the app's new Graphite Lavender
theme. Light-first, subtle violet-gray undertone. The
accent is dark graphite (#1e1e2e). Status colors (green,
amber, red, blue, violet) are the only chromatic elements.

### Colors

```
Surfaces:
  Base:    #fafafc    (page background)
  Card:    #ffffff    (sections, cards)
  Raised:  #f3f3f8    (feature card bg, columns)
  Overlay: #e4e4ec    (borders, dividers)

Text:
  Primary:   #1e1e2e  (headings, body)
  Secondary: #4a4b65  (descriptions)
  Tertiary:  #6e7191  (labels, captions)
  Muted:     #8b8fa3  (placeholders, small text)

Accent:
  CTA:       #1e1e2e  (buttons, links)
  CTA hover: #33334d
  CTA muted: rgba(30, 30, 46, 0.06)

Borders:
  Default: #e4e4ec
  Subtle:  #f3f3f8

Status (for mocks only):
  Green:  #16a34a   Amber: #d97706   Red: #dc2626
  Blue:   #2563eb   Violet: #7c3aed  Slate: #64748b
```

### Typography

- Font: Inter (Google Fonts), weights 300-800
- Base: 16px, line-height 1.6
- Headings: 700-800 weight, tight letter-spacing


## Logo

Chevron Dot icon. SVG files exist in the website/ folder:
- kaisho-logo.svg (dark #1e1e2e, for light bg)

The logo is a terminal chevron `>` plus a dot. Story:
"Execute. Result." The name "KAISHO" is displayed as plain
text in Inter Bold with letter-spacing 0.06em.


## Website Structure (sections in order)

1. **Nav** — sticky, frosted glass bg. Logo + KAISHO text
   left, links (Features, CLI, Integrations, Pricing, FAQ)
   center/right, GitHub button + "Get Started" CTA.

2. **Hero** — eyebrow badge with "Open Source · Self-hosted
   · CLI-first". Title: "Freelance work, liberated."
   ("liberated" in accent or subtle gradient). Subtitle
   about all-in-one system. Two CTAs: "Start Free" +
   "Explore Features". Meta dots: CLI + Web UI, Local-first
   data, AI built in, Free & open source. Below: screenshot
   frame placeholder (macOS chrome dots).

3. **Feature Details** — four alternating text+mock rows:
   a. Kanban Board — mini kanban mock with 3 columns,
      task cards with customer tags, status dots
   b. Time Tracking — timer display mock (02:47:13),
      recent entries list
   c. Customer Budgets — budget bars mock (4 customers,
      green/amber/red based on usage %)
   d. AI Advisor — chat mock with user messages and AI
      responses showing claude-sonnet badge

4. **More Features** — 6-card grid: Inbox & Capture,
   Knowledge Base, GitHub Integration, Scheduled Automation,
   Multi-User Profiles, Command Palette.

5. **CLI Section** — terminal mock with syntax-highlighted
   `kai` commands (clock start, briefing, ask, clock book,
   task add, kb search).

6. **How It Works** — 3 steps on dark section: Install
   (pip install), Point to files, Work.

7. **Integrations** — pill badges: GitHub, Ollama, Claude
   API, OpenRouter, Org-mode, Markdown, LM Studio.

8. **Pricing** — 3 tiers (EUR pricing):
   - Free & Open Source: EUR 0, everything included,
     self-hosted, CLI + Web dashboard, Ollama AI locally,
     bring your own Claude/OpenRouter key, community support
   - Personal (recommended): EUR 5/mo or EUR 39/yr,
     all free features + scheduled automation (cron jobs),
     knowledge base search, GitHub integration, multiple
     profiles, auto-updates, email support
   - Pro: EUR 19/mo or EUR 149/yr, everything in Personal
     + commercial use license, Claude AI included (1M
     tokens/month), priority support, early access to
     new features, company invoice with VAT

9. **FAQ** — 6 questions with accordion:
   - File formats (org-mode + markdown)
   - Own AI model (yes, Ollama/Claude/OpenRouter/LM Studio)
   - Data privacy (self-hosted = local, cloud = EU encrypted)
   - Emacs required (no)
   - Budget tracking (contracts with hour contingents)
   - Migration from Toggl/Clockify/Harvest (CSV import)

10. **Philosophy Section** — centered, the Chevron Dot logo
    large, explanation that Kaisho = Kanban + AI + Shell +
    Organizer.

11. **CTA** — "Stop juggling tools. Start shipping." with
    buttons.

12. **Footer** — 4 columns: brand+tagline, Product links,
    Resources links, Company links (including SENAITY).
    Bottom bar: "A Riding Bytes product" + senaity.com link.


## Reference: SENAITY Landing Page

The SENAITY landing page at ~/develop/buildout/products/
senaity/landing/index.html uses a similar structure and
can be used as structural reference. However, the Kaisho
site uses the Graphite Lavender palette (NOT SENAITY's
teal palette).


## Reference: App Features

For accurate feature descriptions, read the CLAUDE.md at
the project root and the gap analysis at
product/GAP-ANALYSIS.md which lists all implemented
features, CLI commands, and API endpoints.


## Coding Style

- Double quotes for all strings
- Max 80 columns for code and comments
- Single index.html file with inline CSS and HTML
- No JavaScript except FAQ accordion toggle
- No emojis in code
- Clean, semantic HTML
