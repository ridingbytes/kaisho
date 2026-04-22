# Notes API

Note management with customer and task links.

**Prefix:** `/api/notes`

## List Notes

```
GET /api/notes
```

## Create Note

```
POST /api/notes
```

**Body:**

```json
{
  "title": "Sprint retro findings",
  "body": "## What went well\n- Deploy pipeline stable",
  "customer": "Acme Corp",
  "task_id": "abc123",
  "tags": ["meeting", "retro"]
}
```

## Update Note

```
PATCH /api/notes/{note_id}
```

All fields optional.

## Delete Note

```
DELETE /api/notes/{note_id}
```

## Reorder Notes

```
PUT /api/notes/order
```

**Body:** Array of note IDs.

## Promote to Task

```
POST /api/notes/{note_id}/promote
```

**Body:**

```json
{
  "customer": "Acme Corp"
}
```

## Move Note

```
POST /api/notes/{note_id}/move
```

**Body:**

```json
{
  "destination": "kb",
  "customer": "Acme Corp",
  "filename": "retro-notes.md"
}
```

Destinations: `task`, `kb`, `archive`.
