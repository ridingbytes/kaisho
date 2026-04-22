# Inbox API

Capture and triage inbox items.

**Prefix:** `/api/inbox`

## List Items

```
GET /api/inbox
```

## Capture Item

```
POST /api/inbox/capture
```

**Body:**

```json
{
  "text": "Check SSL cert expiration",
  "type": "NOTE",
  "customer": "Acme Corp",
  "body": "Detailed description",
  "channel": "email",
  "direction": "in"
}
```

Only `text` is required.

## Update Item

```
PATCH /api/inbox/{item_id}
```

**Body** (all fields optional):

```json
{
  "title": "Updated title",
  "type": "LEAD",
  "customer": "Beta Inc",
  "body": "New details",
  "channel": "phone",
  "direction": "out"
}
```

## Delete Item

```
DELETE /api/inbox/{item_id}
```

## Reorder Items

```
PUT /api/inbox/order
```

**Body:** Array of item IDs in desired order.

## Promote to Task

```
POST /api/inbox/{item_id}/promote
```

**Body:**

```json
{
  "customer": "Acme Corp"
}
```

Creates a task from the inbox item and removes it from the inbox.

## Move Item

Move to a different destination.

```
POST /api/inbox/{item_id}/move
```

**Body:**

```json
{
  "destination": "note",
  "customer": "Acme Corp",
  "filename": "optional-kb-filename.md"
}
```

Destinations: `todo`, `note`, `kb`, `archive`.
