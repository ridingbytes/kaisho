# Kaisho SaaS Readiness Assessment

Updated: 2026-04-08. Based on current single-user
architecture.


## Current Architecture

Kaisho is a single-user, self-hosted application.
There is no login, no sessions, no multi-user auth.
The app starts and serves one user's data directly.

Multiple profiles allow different backends and settings
within the same instance.


## What Already Exists

- Pluggable backends: org-mode, markdown, JSON, SQL
  (SQLite/PostgreSQL via SQLAlchemy)
- FastAPI with WebSocket for real-time updates
- Profile switching and CRUD
- Configurable CORS origins via environment variable
- Backend conversion CLI (kai convert)
- Import/export between all backend formats


## Deployment Path: Docker-per-Customer

For a hosted SaaS tier, the recommended approach is
one Docker container per customer:

- Each customer gets their own isolated instance
- No multi-tenant code needed
- Reverse proxy routes subdomains to containers
- Authentication handled at proxy level (basic auth,
  OAuth, or API key)
- No changes to the Kaisho codebase required

This matches Phase 3 from MONETIZATION.md.


## What Would Be Needed

| Component | Effort | Notes |
|-----------|--------|-------|
| Dockerfile | 4h | Python + Node build |
| Reverse proxy config | 4h | Caddy/Traefik subdomain routing |
| Deploy script | 16h | Container + volume + subdomain |
| Stripe subscription | 16h | Checkout + webhook |
| Monitoring | 8h | Uptime, disk, memory per container |
| Backup automation | 4h | Volume snapshots |

Total: ~52h for minimum viable hosted tier.


## Not Needed (Removed)

The following were previously listed as gaps but are
no longer relevant after the single-user refactor:

- Multi-user session storage (removed)
- JWT token signing (removed)
- Per-request user context (removed)
- Multi-instance file locking (not needed for
  single-user containers)
