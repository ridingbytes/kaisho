# Kaisho Product & Business Docs

All strategic documents for the Kaisho product.

## Documents

| File | Purpose |
|------|---------|
| MONETIZATION.md | Monetization strategy comparison (hosted vs desktop app vs hybrid) with pricing, revenue projections, and implementation phases. |
| GAP-ANALYSIS.md | Feature inventory mapped to pricing tiers. Lists what exists, what is missing, and effort estimates per phase. |
| DESIGN-SPEC.md | Authoritative Graphite Lavender design system. All colors, typography, status colors, and brand rules as implemented in code. |
| SAAS-READINESS.md | Technical audit of current codebase for SaaS deployment. Lists what exists (auth, multi-user) and what is missing. |
| INFRASTRUCTURE.md | Docker resource analysis. RAM/CPU per instance, VPS capacity tables, cost vs revenue at scale. |
| WEBSITE-BRIEF.md | Complete brief for building the product website. |
| BUGS.md | Known bugs and issues to fix short-term. |

## Directories

| Path | Contents |
|------|----------|
| website/ | Product website (index.html + logo SVGs + logo-concepts.html) |
| ci-alternatives/ | All explored logo and palette variants (archive) |

## Key Decisions Made

- **Name:** Kaisho (Kanban + AI + Shell + Organizer)
- **Domain:** kaisho.dev
- **CLI command:** `kai`
- **Logo:** Chevron Dot ("Execute. Result.")
- **Palette:** Graphite Lavender (light-first)
- **Monetization:** Hybrid model (Phase 1: license key
  gating, Phase 2: Tauri desktop app, Phase 3: hosted tier)
- **Pricing:** Free / EUR 5 Personal / EUR 19 Pro
- **Company:** Riding Bytes (also SENAITY)
