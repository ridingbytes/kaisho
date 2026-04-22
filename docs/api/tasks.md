# Tasks API

Task (kanban) management endpoints.

**Prefix:** `/api/kanban`

## List Tasks

```
GET /api/kanban/tasks
```

| Query Parameter | Type | Description |
|-----------------|------|-------------|
| `status` | string | Filter by status |
| `customer` | string | Filter by customer |
| `tag` | string | Filter by tag |
| `include_done` | boolean | Include completed tasks |

**Response:** Array of task objects.

```json
[
  {
    "id": "abc123",
    "customer": "Acme Corp",
    "title": "Design landing page",
    "status": "IN-PROGRESS",
    "tags": ["design", "frontend"],
    "body": "Mobile-first layout",
    "github_url": "https://github.com/acme/repo/issues/42",
    "created": "2026-04-20T09:00:00"
  }
]
```

## Create Task

```
POST /api/kanban/tasks
```

**Body:**

```json
{
  "customer": "Acme Corp",
  "title": "Design landing page",
  "status": "TODO",
  "tags": ["design"],
  "body": "Description text",
  "github_url": "https://github.com/acme/repo/issues/42"
}
```

Returns 201 with the created task.

## Update Task

```
PATCH /api/kanban/tasks/{task_id}
```

**Body** (all fields optional):

```json
{
  "title": "Updated title",
  "customer": "Beta Inc",
  "status": "DONE",
  "body": "New description",
  "github_url": null
}
```

## Update Tags

Replace all tags on a task.

```
PATCH /api/kanban/tasks/{task_id}/tags
```

**Body:**

```json
{
  "tags": ["urgent", "backend"]
}
```

## Reorder Tasks

Persist the display order of tasks.

```
PUT /api/kanban/tasks/order
```

**Body:** Array of task IDs in desired order.

## Archive Task

```
DELETE /api/kanban/tasks/{task_id}
```

Returns 204. Moves the task to the archive.

## List Archived Tasks

```
GET /api/kanban/archive
```

## Unarchive Task

```
POST /api/kanban/archive/{task_id}/unarchive
```

## Delete Archived Task

Permanently remove an archived task.

```
DELETE /api/kanban/archive/{task_id}
```

## List Tags

Tags with metadata and usage counts.

```
GET /api/kanban/tags
```
