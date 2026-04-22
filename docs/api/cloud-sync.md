# Cloud Sync API

Bidirectional synchronization with Kaisho Cloud.

**Prefix:** `/api/cloud-sync`

## Status

```
GET /api/cloud-sync/status
```

Returns connection state, plan info, sync metadata.

## Connect

```
POST /api/cloud-sync/connect
```

**Body:**

```json
{
  "url": "https://cloud.kaisho.dev",
  "api_key": "your-api-key"
}
```

## Disconnect

```
POST /api/cloud-sync/disconnect
```

Removes cloud connection. Optionally wipes cloud-side data.

## Toggle Cloud AI

```
PATCH /api/cloud-sync/cloud-ai
```

**Body:** `{"enabled": true}`

## AI Usage

```
GET /api/cloud-sync/ai-usage
```

**Response:**

```json
{
  "total_tokens": 125000,
  "cap": 500000,
  "request_count": 42,
  "month": "2026-04"
}
```

## Sync Now

Force immediate sync.

```
POST /api/cloud-sync/sync-now
```

Blocks until the push/pull cycle completes.

## Cloud Timer

```
GET /api/cloud-sync/active
POST /api/cloud-sync/stop-cloud-timer?timer_id=xyz
```

## Triage

Assign customers to unassigned cloud entries.

```
POST /api/cloud-sync/triage
```

**Body:**

```json
{
  "entries": [
    {"start": "2026-04-20T09:00:00", "customer": "Acme Corp"}
  ]
}
```

## Pending Entries

List entries with empty customer (from mobile).

```
GET /api/cloud-sync/pending
```
