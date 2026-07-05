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
