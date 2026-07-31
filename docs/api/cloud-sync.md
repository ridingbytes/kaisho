# Cloud Sync API

Bidirectional synchronization with Kaisho Cloud.

**Prefix:** `/api/cloud-sync`

!!! info "Sync model in one line"
    Local writes push eagerly (debounced 2s); cloud changes arrive
    via WebSocket; a 5-minute polling cycle backs both paths up.
    See [Cloud Sync guide](../integrations/cloud-sync.md) for the
    end-user view.

## Status

```
GET /api/cloud-sync/status
```

Returns connection state and sync metadata.

**Response:**

```json
{
  "enabled": true,
  "api_key_set": true,
  "url": "https://cloud.kaisho.dev",
  "interval": 300,
  "connected": true,
  "plan": "free",
  "email": "user@example.com",
  "last_pull_cursor": "2026-06-02T08:14:11Z",
  "last_push_cursor": "2026-06-02T08:14:09Z",
  "last_pull_at": "2026-06-02T08:14:12Z",
  "last_push_at": "2026-06-02T08:14:10Z",
  "last_error": null,
  "pending_deletes": 0,
  "cloud_entry_count": 412,
  "cloud_last_change_at": "2026-06-02T08:13:58Z",
  "cloud_active_timer_id": null
}
```

`plan` is always `free` (there are no paid tiers). Any account on
a connected server can sync.

## Connect

```
POST /api/cloud-sync/connect
```

Authenticates against the cloud, resets local sync cursors, and
runs an initial pull.

**Body:**

```json
{
  "url": "https://cloud.kaisho.dev",
  "api_key": "your-api-key"
}
```

**Response:**

```json
{
  "ok": true,
  "plan": "free",
  "auto_set_models": true
}
```

On connect, if `advisor_model` and `cron_model` are unset in
settings, they are auto-populated to `kaisho:advisor` and
`kaisho:cron`. Existing non-empty values are preserved.

## Disconnect

```
POST /api/cloud-sync/disconnect
```

Performs a final pull, optionally wipes cloud-side data, and
disables sync locally. Local data is not affected.

**Response:**

```json
{
  "ok": true,
  "wiped": true,
  "pull_error": null,
  "wipe_error": null
}
```

## AI Usage

```
GET /api/cloud-sync/ai-usage
```

Returns monthly token usage from the hosted AI gateway.

**Response:**

```json
{
  "total_tokens": 125000,
  "cap": 200000,
  "request_count": 42,
  "month": "2026-06"
}
```

Cap defaults to 200000 tokens, configurable per server instance.

## Sync Now

Force an immediate blocking sync cycle.

```
POST /api/cloud-sync/sync-now
```

Returns the cycle result:

```json
{
  "enabled": true,
  "pulled_up": 12,
  "pulled_del": 1,
  "pushed_live": 4,
  "pushed_del": 0,
  "duration_ms": 614
}
```

Returns `{"enabled": false}` when cloud sync is disabled.

## Use Kaisho Models

```
POST /api/cloud-sync/use-kaisho-models
```

Bulk-switches the advisor and every cron job to the hosted Kaisho
models in one call. Idempotent.

**Response:**

```json
{
  "advisor_model": "kaisho:advisor",
  "cron_model": "kaisho:cron",
  "advisor_changed": true,
  "jobs_changed": 4
}
```

## Cloud Timer

Read or stop the timer running on cloud (typically started from the
mobile PWA on another device).

```
GET  /api/cloud-sync/active
POST /api/cloud-sync/stop-cloud-timer
```

`GET /active` returns `{"active": false}` when sync is disabled,
otherwise the cloud's view of the running timer.

`POST /stop-cloud-timer` accepts an optional `timer_id` query
param. It triggers an eager push so the desktop reflects the new
state immediately.

## Triage

Mobile entries usually arrive with the customer field already set.
When a mobile entry is captured without a customer, it lands on
the desktop with the `FROM_CLOUD` property and is exposed via the
triage endpoints below for batch reassignment.

### Pending entries

```
GET /api/cloud-sync/pending
```

Returns entries currently flagged for triage.

### Assign

```
POST /api/cloud-sync/triage
```

**Body:**

```json
{
  "entries": [
    {
      "start": "2026-06-02T09:00:00",
      "customer": "Acme Corp",
      "task_id": "T-142",
      "contract": "Q2-2026"
    }
  ]
}
```

**Response:**

```json
{"updated": 1}
```

Triggers an eager push. Once an entry is triaged, the `FROM_CLOUD`
property is cleared and it no longer appears in `/pending`.

## Real-time WebSocket events

The cloud relay maintains a WebSocket per connected profile. When
the relay reports a change (`timer:started`, `timer:stopped`,
`entries:changed`, `inbox:changed`, `tasks:changed`,
`notes:changed`), Kaisho schedules a debounced local sync (2s).
The connection uses exponential backoff (2-60s with jitter) on
failure.

The WebSocket is the primary fast path for multi-device sync. The
5-minute polling cycle is a fallback that runs for every connected
profile regardless of which is active.

## Settings keys

Cloud sync is configured per-profile in `settings.yaml`:

```yaml
cloud_sync:
  enabled: false
  url: "https://cloud.kaisho.dev"
  api_key: ""
  interval: 300
```

`interval` is the polling fallback in seconds; the default 300s
(5 min) is sufficient because the WebSocket handles real-time.
