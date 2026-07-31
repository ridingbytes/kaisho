# Cloud Sync

Cloud sync keeps your data in step between the desktop app and the
mobile PWA, using a Kaisho server as the synchronization relay.

The server is [kaisho-cloud](https://github.com/ridingbytes/kaisho-cloud),
which is open source. Run your own on plain PostgreSQL, or point at a
Kaisho-hosted instance. There are no plans or tiers: once you connect a
server, cloud sync, the mobile PWA, the hosted AI gateway, and the
workspace integrations (Linear, Slack, Google Calendar, GitHub Projects)
are all available. Kaisho is free and works fully standalone; the cloud
is optional.

## Connecting

1. Go to **Settings > Cloud Sync**.
2. Enter your Kaisho server URL and its sync token (API key).
3. Press **Connect**.

The initial sync pulls server-side data; subsequent changes flow in
both directions automatically.

If `advisor_model` and `cron_model` are not yet set, connecting
auto-populates them with the hosted models (`kaisho:advisor` and
`kaisho:cron`). Any model you already chose is preserved.

## How sync works

Two paths run in parallel:

**WebSocket (fast path).** The desktop holds a WebSocket to the
cloud for the active profile. When the cloud reports a change
(timer started / stopped, entries / inbox / tasks / notes
changed), the desktop runs a debounced sync after 2 seconds. This
is what makes mobile-to-desktop feel instant.

**Polling (fallback).** A background job runs every 5 minutes for
**every** connected profile, whether or not it is currently
active. This catches anything missed by the WebSocket and keeps
inactive profiles up to date.

**Eager push.** Local changes call into a push scheduler that
enqueues a push immediately. A lock prevents the 5-minute job and
the eager push from overlapping.

**Conflict resolution.** Last writer wins, based on `updated_at`
timestamps. Soft deletes are tracked as tombstones and propagated
to the cloud; tombstones are cleared after the cloud acknowledges
them.

## Sync status

The header bar shows a sync status badge:

- **Green**: connected and in sync
- **Orange**: syncing in progress
- **Red**: sync error (click for details)

Click the badge to navigate to Cloud Sync settings.

## Multiple profiles

Each profile can connect to its own cloud account independently.
Cloud sync credentials (API key, URL) are stored per-profile in
`settings.yaml`.

The 5-minute polling cycle runs for every connected profile.
Real-time WebSocket events are only active for the currently
selected profile; inactive profiles rely on polling alone.

## Mobile access

Once connected, sign into the mobile PWA at your cloud URL. Time
entries created on mobile sync back to the desktop automatically.

Mobile usually attaches a customer at capture time. If a mobile
entry arrives without one, it lands on the desktop with a
`FROM_CLOUD` marker and shows up in the **Cloud Triage** panel of
the Clocks view, where you can batch-assign customer, task, and
contract before they enter the regular timeline.

## Kaisho Cloud AI

A connected server that exposes an AI gateway gives you hosted AI
with no local AI provider or API keys needed. Toggle this in
**Settings > Cloud Sync > Use Kaisho AI**.

The AI token usage meter shows your consumption against the
server's monthly cap (default 200,000 tokens, configurable per
instance).

### Use Kaisho models everywhere

After connecting, click **Settings > Cloud Sync > Use Kaisho
models** to switch the advisor and every cron job to the hosted
models in one step. The button sets `advisor_model` to
`kaisho:advisor`, `cron_model` to `kaisho:cron`, and rewrites
every cron job's `model` to `kaisho:cron`. Idempotent: running it
again on an already-converted profile is a no-op.

## Disconnecting

Go to **Settings > Cloud Sync** and press **Disconnect**. A final
pull runs first, then cloud-side data is wiped (optional) and
local sync state is cleared. Your local data is not touched.

## Manual sync

Force an immediate sync cycle:

```
POST /api/cloud-sync/sync-now
```

This blocks until the push/pull cycle completes. See the
[Cloud Sync API reference](../api/cloud-sync.md) for the full
endpoint catalogue.
