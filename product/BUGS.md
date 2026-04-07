# Known Bugs and Issues

Short-term fixes. Items marked [FIXED] have been resolved.


## Code Issues

### B-01: [FIXED] Default task state colors use -500 instead of -600

**File:** `frontend/src/hooks/useSettings.ts` lines 49-66
**Fix:** Updated NEXT, IN-PROGRESS, WAIT, DONE, CANCELLED
from Tailwind -500 to -600 hex values.

### B-02: [FIXED] CLI help example colors use old values

**File:** `frontend/src/docs/panelDocs.ts` lines 319-328
**Fix:** Updated to match -600 status color set.

### B-03: [FIXED] In-memory session storage

**File:** `kaisho/api/routers/settings.py`
**Fix:** Sessions now persist to `.sessions.json` in the
data directory. Survives server restarts.

### B-04: [FIXED] Auth tokens are base64, not signed

**File:** `kaisho/api/routers/settings.py`
**Fix:** Tokens now include an HMAC-SHA256 signature using
an auto-generated server secret. Forged tokens are rejected.

### B-05: [FIXED] CORS hardcoded to localhost

**File:** `kaisho/api/app.py`
**Fix:** CORS origins now read from `CORS_ORIGINS` env var
(comma-separated). Falls back to localhost defaults.

### B-09: [FIXED] Missing `kai customer add` CLI command

**File:** `kaisho/cli/customer.py`
**Fix:** Added `customer add` subcommand with --status,
--type, --budget, --repo, and --tag options.


## Documentation Issues

### B-06: [FIXED] "omnicontrol" references in docs/

**Fix:** Replaced all 31 references to omnicontrol with
kaisho across docs/CONCEPT.md, quickstart.md, and dev.md.

### B-07: [FIXED] Stale paths in product/ docs

**Fix:** Updated paths in SAAS-READINESS.md and
WEBSITE-BRIEF.md.

### B-08: Website uses CSS mock-ups instead of screenshots

**File:** `product/website/index.html`
**Impact:** The product page shows hand-coded HTML/CSS
mock-ups. Real screenshots are available in
`product/website/screenshots/` and can replace the mocks.
**Status:** Screenshots captured; mock replacement is a
future website update task.
