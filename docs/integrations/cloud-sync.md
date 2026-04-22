# Cloud Sync

Cloud sync keeps your data in step between the desktop app and the
mobile PWA. It uses Kaisho Cloud as the synchronization relay.

## Plans

| Plan | Includes |
|------|----------|
| Free | Local-only, no sync |
| Sync | Bidirectional sync, mobile access |
| Sync + AI | Sync plus hosted AI gateway |

## Connecting

1. Go to **Settings > Cloud Sync**.
2. Enter your Kaisho Cloud API key.
3. Press **Connect**.

The initial sync pushes your local data to the cloud. After that,
changes sync automatically in both directions.

## How Sync Works

- **Push**: local changes are sent to the cloud in real time via
  WebSocket
- **Pull**: cloud changes (from mobile or other devices) arrive via
  WebSocket and merge into local data
- **Conflict resolution**: last writer wins, based on `updated_at`
  timestamps
- **Soft deletes**: deleted entries are tracked as tombstones and
  propagated to the cloud

## Sync Status

The header bar shows a sync status badge:

- **Green**: connected and in sync
- **Orange**: syncing in progress
- **Red**: sync error (click for details)

Click the badge to navigate to Cloud Sync settings.

## Mobile Access

Once connected, sign into the mobile PWA at your cloud URL.
Time entries created on mobile sync back to the desktop
automatically.

Entries from mobile may arrive without a customer assignment. The
**Cloud Triage** panel in the clocks view lets you assign customers
and contracts to these entries in bulk.

## Kaisho Cloud AI

With a Sync + AI plan, the advisor uses the hosted AI gateway.
No local AI provider or API keys needed. Toggle this in
**Settings > Cloud Sync > Use Kaisho AI**.

The AI token usage meter shows your consumption against the monthly
quota.

## Disconnecting

Go to **Settings > Cloud Sync** and press **Disconnect**. This
removes the cloud connection and optionally wipes cloud-side data.
Local data is not affected.

## Manual Sync

Force an immediate sync cycle:

```
POST /api/cloud-sync/sync-now
```

This blocks until the push/pull cycle completes.
