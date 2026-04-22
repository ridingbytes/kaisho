# Clocks API

Time tracking endpoints.

**Prefix:** `/api/clocks`

## List Entries

```
GET /api/clocks/entries
```

| Query Parameter | Type | Default | Description |
|-----------------|------|---------|-------------|
| `period` | string | `"month"` | `today`, `week`, `month`, `year` |
| `customer` | string | | Filter by customer name |
| `from_date` | string | | Start date (YYYY-MM-DD) |
| `to_date` | string | | End date (YYYY-MM-DD) |
| `task_id` | string | | Filter by linked task |

**Response:** Array of clock entry objects.

```json
[
  {
    "start": "2026-04-20T09:00:00",
    "end": "2026-04-20T11:30:00",
    "customer": "Acme Corp",
    "description": "Landing page design",
    "hours": 2.5,
    "task_id": "abc123",
    "contract": "Q2 2026",
    "invoiced": false,
    "notes": ""
  }
]
```

## Active Timer

```
GET /api/clocks/active
```

**Response:**

```json
{
  "active": true,
  "start": "2026-04-20T14:00:00",
  "customer": "Acme Corp",
  "description": "Bug fixing"
}
```

Returns `{"active": false}` when no timer is running.

## Start Timer

```
POST /api/clocks/start
```

**Body:**

```json
{
  "customer": "Acme Corp",
  "description": "Working on feature X",
  "task_id": "abc123",
  "contract": "Q2 2026"
}
```

Only `customer` is required.

## Stop Timer

```
POST /api/clocks/stop
```

No body required. Returns the completed entry.

## Quick Book

Book time retroactively.

```
POST /api/clocks/quick-book
```

**Body:**

```json
{
  "duration": "2h",
  "customer": "Acme Corp",
  "description": "Morning standup",
  "task_id": null,
  "contract": "Q2 2026",
  "date": "2026-04-20",
  "notes": ""
}
```

## Update Entry

```
PATCH /api/clocks/entries?start=2026-04-20T09:00:00
```

**Body** (all fields optional):

```json
{
  "customer": "Beta Inc",
  "description": "Updated description",
  "hours": 3.0,
  "new_date": "2026-04-21",
  "start_time": "10:00",
  "task_id": "def456",
  "invoiced": true,
  "notes": "Review completed",
  "contract": "Q2 2026"
}
```

## Delete Entry

```
DELETE /api/clocks/entries?start=2026-04-20T09:00:00
```

Returns 204.

## Summary

Aggregated hours per customer.

```
GET /api/clocks/summary?period=month
```

## Invoice Preview

Unbilled entries for a customer.

```
GET /api/clocks/invoice-preview?customer=Acme+Corp
```

Optional: `contract`, `from_date`, `to_date`.

**Response:**

```json
{
  "customer": "Acme Corp",
  "contract": "Q2 2026",
  "entries": [...],
  "total_hours": 42.5,
  "entry_count": 18
}
```

## Batch Invoice

Mark entries as invoiced.

```
POST /api/clocks/batch-invoice
```

**Body:**

```json
{
  "starts": ["2026-04-20T09:00:00", "2026-04-20T14:00:00"]
}
```

**Response:** `{"invoiced": 2}`

## iCalendar Feed

```
GET /api/clocks/calendar.ics
```

Returns clock entries as iCalendar events. Add this URL to your
calendar app.

Content-Type: `text/calendar`
