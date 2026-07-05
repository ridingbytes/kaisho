# Automations (Webhooks)

Kaisho can send a signed webhook to an external tool whenever a task
or clock entry changes. Point it at n8n, Make, Zapier, or any HTTP
endpoint and build automations: post to Slack when a task is done,
append every booked entry to a spreadsheet, open a GitHub issue from
a backlog card.

!!! version-added "Since 2.6.0"

    Outbound webhooks and the **Settings → Automations** panel.

## How it works

Every task and clock mutation emits a domain event. You subscribe an
endpoint to some or all of those events; Kaisho delivers each event
as a JSON `POST` to your URL, off the write path, with a short retry
on failure.

Webhooks fire from the desktop backend where your data lives, so they
work offline against a webhook receiver on the same machine or LAN.
They do not fire while the app is closed.

## Add an endpoint

1. Open **Settings → Automations**.
2. Paste your receiver URL (for example an n8n Webhook node URL).
3. Check the events you want, or leave all unchecked to receive every
   event.
4. Optionally set a signing secret (see [Verifying](#verifying-the-signature)).
5. Click **Add endpoint**.

Adding an endpoint approves its domain in the URL allowlist
automatically. Use **Send test event** on a row to deliver a
synthetic `ping` and confirm the receiver is reachable. The **Recent
deliveries** list shows the outcome of each attempt.

## Events

| Event | Fires when |
|---|---|
| `task.created` | A task is created |
| `task.moved` | A task changes status (carries `from_state` / `to_state`) |
| `task.updated` | A task's fields or tags change |
| `task.archived` | A task is archived |
| `clock.booked` | A completed entry is booked |
| `clock.timer_started` | A timer starts |
| `clock.timer_stopped` | A timer stops |
| `clock.updated` | An entry is edited |
| `clock.deleted` | An entry is deleted |

## Payload

Each delivery is a JSON body like:

```json
{
  "event": "task.moved",
  "id": "evt_1f2e3d…",
  "profile": "work",
  "occurred_at": "2026-07-05T14:32:10Z",
  "data": {
    "task": { "id": "…", "title": "…", "status": "DONE" },
    "delta": { "from_state": "DOING", "to_state": "DONE" }
  }
}
```

`data.task` (or `data.entry` for clock events) is the full entity in
the same shape the REST API returns, so a consumer never has to call
back to read it. `data.delta` names only what changed.

## Payload reference

Everything a receiver needs to route, read, and verify a delivery.

### Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Kaisho-Event` | the event name, e.g. `task.moved` |
| `X-Kaisho-Signature` | `sha256=<hex>`, present only when the endpoint has a secret |
| `User-Agent` | `kaisho-webhooks` |

### Envelope

| Field | Type | Notes |
|---|---|---|
| `event` | string | One of the event names below |
| `id` | string | Unique event id, `evt_<hex>` |
| `profile` | string | The Kaisho profile the change happened in |
| `occurred_at` | string | UTC ISO-8601 with a `Z` suffix |
| `data` | object | Event payload (see below) |

### `data.task` (task events)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable task id |
| `sync_id` | string | Cross-device sync id |
| `customer` | string or null | Parsed from the `[Customer]:` title prefix |
| `title` | string | Full heading title, including the prefix |
| `status` | string | Current state (`TODO`, `DONE`, a custom state, …) |
| `tags` | string[] | |
| `deadline` | string or null | `YYYY-MM-DD` |
| `github_url` | string | Empty string when unset |
| `created` | string | Org bracket form, `[YYYY-MM-DD Day HH:MM]` |
| `updated_at` | string | Local ISO-8601 with microseconds, no `Z` |
| `body` | string | User body text, state-log lines excluded |
| `properties` | object | Raw org properties |
| `state_history` | array | `{to, from, timestamp}`, newest first |

### `data.entry` (clock events)

| Field | Type | Notes |
|---|---|---|
| `sync_id` | string | |
| `customer` | string | |
| `description` | string | |
| `start` | string | Local ISO-8601, no `Z` |
| `end` | string or null | `null` while a timer is running |
| `duration_minutes` | integer or null | `null` while running |
| `task_id` | string or null | Linked task, when any |
| `contract` | string or null | |
| `invoiced` | boolean | |
| `notes` | string | Empty string when none |
| `updated_at` | string | Local ISO-8601 with microseconds, no `Z` |
| `from_cloud` | boolean | Present and `true` only for entries synced from mobile |

### Delta by event

`data.delta` is present only where a change has a meaningful before/
after. Everything else omits it.

| Event | Payload key | `delta` |
|---|---|---|
| `task.created` | `task` | — |
| `task.moved` | `task` | `{from_state, to_state}` |
| `task.updated` | `task` | subset of `{title, customer, body, github_url, deadline, tags}` |
| `task.archived` | `task` | — |
| `clock.booked` | `entry` | — |
| `clock.timer_started` | `entry` | — |
| `clock.timer_stopped` | `entry` | — |
| `clock.updated` | `entry` | subset of `{customer, description, hours, new_date, start_time, task_id, invoiced, notes, contract}` |
| `clock.deleted` | `entry` | — |

### Examples

`task.created`:

```json
{
  "event": "task.created",
  "id": "evt_9f3a1c2b4d5e",
  "profile": "work",
  "occurred_at": "2026-07-05T09:12:00Z",
  "data": {
    "task": {
      "id": "T-a1b2c3",
      "sync_id": "3f9c1e2a-8b7d-4c6a-9e21-1a2b3c4d5e6f",
      "customer": "Acme",
      "title": "[Acme]: Fix login redirect",
      "status": "TODO",
      "tags": ["billable"],
      "deadline": null,
      "github_url": "",
      "created": "[2026-07-05 Sun 09:12]",
      "updated_at": "2026-07-05T09:12:00.031288",
      "body": "",
      "properties": { "TASK_ID": "T-a1b2c3" },
      "state_history": []
    }
  }
}
```

`task.moved`:

```json
{
  "event": "task.moved",
  "id": "evt_5c4b3a2f1e0d",
  "profile": "work",
  "occurred_at": "2026-07-05T14:32:10Z",
  "data": {
    "task": {
      "id": "T-a1b2c3",
      "customer": "Acme",
      "title": "[Acme]: Fix login redirect",
      "status": "DONE",
      "tags": ["billable"]
    },
    "delta": { "from_state": "DOING", "to_state": "DONE" }
  }
}
```

`task.updated`:

```json
{
  "event": "task.updated",
  "id": "evt_1a1b1c1d1e1f",
  "profile": "work",
  "occurred_at": "2026-07-05T15:01:00Z",
  "data": {
    "task": { "id": "T-a1b2c3", "title": "[Acme]: Fix SSO redirect" },
    "delta": { "title": "Fix SSO redirect" }
  }
}
```

`task.archived`:

```json
{
  "event": "task.archived",
  "id": "evt_2b2c2d2e2f20",
  "profile": "work",
  "occurred_at": "2026-07-05T18:00:00Z",
  "data": {
    "task": { "id": "T-a1b2c3", "status": "DONE", "title": "[Acme]: Fix SSO redirect" }
  }
}
```

`clock.booked`:

```json
{
  "event": "clock.booked",
  "id": "evt_3c3d3e3f3021",
  "profile": "work",
  "occurred_at": "2026-07-05T17:30:00Z",
  "data": {
    "entry": {
      "sync_id": "b1c2d3e4-f506-4a7b-8c9d-0e1f2a3b4c5d",
      "customer": "Acme",
      "description": "Pairing on the redirect bug",
      "start": "2026-07-05T16:00:00",
      "end": "2026-07-05T17:30:00",
      "duration_minutes": 90,
      "task_id": "T-a1b2c3",
      "contract": "Maintenance 2026",
      "invoiced": false,
      "notes": "",
      "updated_at": "2026-07-05T17:30:00.412009"
    }
  }
}
```

`clock.timer_started`:

```json
{
  "event": "clock.timer_started",
  "id": "evt_4d4e4f405162",
  "profile": "work",
  "occurred_at": "2026-07-05T09:00:00Z",
  "data": {
    "entry": {
      "sync_id": "c2d3e4f5-0617-4b8c-9d0e-1f2a3b4c5d6e",
      "customer": "Acme",
      "description": "Investigating the redirect",
      "start": "2026-07-05T09:00:00",
      "end": null,
      "duration_minutes": null,
      "task_id": null,
      "contract": null,
      "invoiced": false,
      "notes": "",
      "updated_at": "2026-07-05T09:00:00.100773"
    }
  }
}
```

`clock.timer_stopped`:

```json
{
  "event": "clock.timer_stopped",
  "id": "evt_5e5f50617283",
  "profile": "work",
  "occurred_at": "2026-07-05T10:15:00Z",
  "data": {
    "entry": {
      "sync_id": "c2d3e4f5-0617-4b8c-9d0e-1f2a3b4c5d6e",
      "customer": "Acme",
      "description": "Investigating the redirect",
      "start": "2026-07-05T09:00:00",
      "end": "2026-07-05T10:15:00",
      "duration_minutes": 75,
      "task_id": null,
      "contract": null,
      "invoiced": false,
      "notes": "",
      "updated_at": "2026-07-05T10:15:00.884210"
    }
  }
}
```

`clock.updated`:

```json
{
  "event": "clock.updated",
  "id": "evt_60718293a4b5",
  "profile": "work",
  "occurred_at": "2026-07-05T11:00:00Z",
  "data": {
    "entry": {
      "sync_id": "c2d3e4f5-0617-4b8c-9d0e-1f2a3b4c5d6e",
      "customer": "Acme",
      "description": "Investigating the redirect",
      "start": "2026-07-05T09:00:00",
      "end": "2026-07-05T10:15:00",
      "duration_minutes": 75,
      "task_id": null,
      "contract": "Maintenance 2026",
      "invoiced": true,
      "notes": "",
      "updated_at": "2026-07-05T11:00:00.220145"
    },
    "delta": { "invoiced": true, "contract": "Maintenance 2026" }
  }
}
```

`clock.deleted`:

```json
{
  "event": "clock.deleted",
  "id": "evt_718293a4b5c6",
  "profile": "work",
  "occurred_at": "2026-07-05T11:05:00Z",
  "data": {
    "entry": {
      "sync_id": "c2d3e4f5-0617-4b8c-9d0e-1f2a3b4c5d6e",
      "customer": "Acme",
      "description": "Investigating the redirect",
      "start": "2026-07-05T09:00:00",
      "end": "2026-07-05T10:15:00",
      "duration_minutes": 75,
      "task_id": null,
      "contract": "Maintenance 2026",
      "invoiced": true,
      "notes": "",
      "updated_at": "2026-07-05T11:00:00.220145"
    }
  }
}
```

## Verifying the signature

When an endpoint has a secret, Kaisho signs each request with an
`X-Kaisho-Signature: sha256=<hex>` header, an HMAC-SHA256 of the raw
request body keyed by the secret. Recompute it on your side and
compare to reject forged requests. This matches the GitHub and Stripe
webhook conventions, so n8n's built-in verification works.

An `X-Kaisho-Event` header carries the event name for quick routing.

## Delivery and retries

A delivery is attempted up to three times with a short exponential
backoff, then recorded as failed and kept in the delivery log for
inspection. A subscription whose domain is not on the URL allowlist
is recorded as `blocked` and never sent.

## Testing with webhook.site

To try it without any tooling, open [webhook.site](https://webhook.site),
copy the unique URL, add it as an endpoint, then move a task. The
request body appears on webhook.site instantly.
