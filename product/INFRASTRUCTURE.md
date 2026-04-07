# Kaisho Infrastructure & Hosting Analysis

## Docker Resource Requirements per Instance

One Kaisho instance runs:
- Python 3.12 + FastAPI/Uvicorn (backend)
- Static frontend files (served by Uvicorn)
- SQLite (cron_history only)
- No Redis, no Node, no external DB

### Memory per container

| Component | RAM |
|-----------|-----|
| Python 3.12 runtime | ~30 MB |
| FastAPI/Uvicorn idle | ~20 MB |
| Libraries (pydantic, click, httpx, apscheduler, watchfiles, yaml) | ~30 MB |
| Org-parser + user data in memory | ~5-20 MB |
| **Total per instance** | **~100-150 MB** |

With shared Docker base image (same Python, same libs),
read-only layers are shared across containers. Only
process state and data volumes are per-container. Saves
~30-40 MB per instance.

### CPU

Negligible. Kaisho is I/O-bound (file reads, occasional
API calls to Ollama/Claude). A freelancer generates
~50-100 API requests/hour. Hundreds of users on 4 cores.

### Disk per user

- App code: ~50 MB (shared via Docker image)
- User data: ~1-10 MB (org-files, SQLite)
- 100 users = ~1-2 GB total data


## VPS Capacity (Hetzner)

| VPS | RAM | Price/mo | Instances (conservative) | Instances (tight) |
|-----|-----|----------|--------------------------|-------------------|
| CX22 | 4 GB | EUR 4 | ~20 | ~30 |
| CX32 | 8 GB | EUR 7 | ~45 | ~60 |
| CX42 | 16 GB | EUR 16 | ~100 | ~130 |
| CX52 | 32 GB | EUR 30 | ~220 | ~280 |

Conservative = 150 MB/instance + 1 GB OS/proxy overhead.
Tight = 100 MB/instance + shared base image optimization.


## Revenue vs Cost at Scale

| Customers | Server | Cost/mo | Revenue (EUR 9/mo) | Margin |
|-----------|--------|---------|--------------------|---------|
| 10 | 1x CX22 | EUR 4 | EUR 90 | 96% |
| 30 | 1x CX32 | EUR 7 | EUR 270 | 97% |
| 50 | 1x CX32 | EUR 7 | EUR 450 | 98% |
| 100 | 1x CX42 | EUR 16 | EUR 900 | 98% |
| 200 | 1x CX52 | EUR 30 | EUR 1,800 | 98% |


## Required Components for Hosted Tier

- Reverse proxy: Caddy or Traefik (subdomain routing)
- Deploy script: create container + volume + subdomain
- Stripe Checkout for subscriptions
- Usage tracking for AI token consumption (Pro tier)
- Monitoring: uptime, disk, memory per container
- Backup: daily volume snapshots

No Dockerfile exists yet. Needs to be created.
