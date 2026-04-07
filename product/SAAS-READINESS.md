# Kaisho SaaS Readiness Assessment

Audit date: 2026-04-07. Based on code in ~/develop/kaisho/.


## What Already Exists

### Authentication (working)
- LoginPage.tsx with username/password + registration
- Token stored in localStorage as `kai_token` (Bearer)
- Backend: session tokens, .htpasswd files (SHA-256+salt)
- Rate limiting: 10 attempts per 5 min per IP
- Token TTL: 24 hours

### Multi-User (working)
- Users stored in data/users/{username}/
- Each user has user.yaml + profile directories
- Login sets os.environ["KAISHO_USER"] + PROFILE,
  then calls reset_config()
- Data isolation via profile paths

### Backend Abstraction (clean)
- Pluggable: org, markdown, json backends
- Base class in kaisho/backends/base.py
- Easy to add a database backend


## Critical Gaps for Cloud SaaS

### 1. In-Memory Session Storage
- Sessions dict lost on every server restart
- Incompatible with multi-instance deployment
- Fix: Redis or PostgreSQL session store
- Effort: 2-3 hours

### 2. Global os.environ for User Context
- os.environ["KAISHO_USER"] is process-wide
- Concurrent API requests overwrite each other
- Fix: request middleware passes user_id per request
- Effort: ~1 week (refactor all routers)

### 3. File System as Database
- All data in local org/markdown/YAML files
- Works single-machine, breaks distributed
- Fix: DB-backed backend or S3 with per-user prefix
- Effort: 1-2 weeks

### 4. No Multi-Instance Support
- File watcher ties backend to single process
- Race conditions with multiple servers
- Fix: Redis Pub/Sub or webhook notifications
- Effort: ~1 week

### 5. Token Security
- Tokens are base64-encoded, not signed
- Fix: JWT with server secret
- Effort: 4 hours

### 6. CORS Hardcoded
- Only allows localhost:5173 and localhost:3000
- Fix: read from environment
- Effort: 1 hour


## Deployment Options

### Option A: Docker-per-Customer (quick, no refactor)
- Each customer gets own container + volume
- No multi-tenant needed, no code changes
- Reverse proxy routes subdomains to containers
- Timeline: 3-4 days
- Limitation: one user per instance

### Option B: Multi-Tenant SaaS (proper, needs refactor)
- Fix gaps 1-5 above
- Add database backend
- Timeline: 3-4 weeks
- Scales to thousands of users

### Recommendation
Start with Option A. Migrate to B only when demand
justifies the engineering investment.


## What is Already Good
- Backend abstraction is clean and extensible
- FastAPI with proper CORS, WebSocket support
- Frontend has login, token persistence, Bearer auth
- CLI services layer is framework-agnostic
- No dependency on local tools (Emacs, git hooks)
