# Advisor API

AI assistant with tool calling.

**Prefix:** `/api/advisor`

## Ask (Streaming)

```
POST /api/advisor/ask
```

**Body:**

```json
{
  "question": "What should I focus on today?",
  "model": "ollama:qwen3:14b",
  "include_github": false,
  "history": [
    {"role": "user", "text": "Previous question"},
    {"role": "assistant", "text": "Previous answer"}
  ]
}
```

**Response:** Server-Sent Events (SSE) stream.

```
Content-Type: text/event-stream
```

**Event types:**

| Event | Data | Description |
|-------|------|-------------|
| `model` | `{"model": "ollama:qwen3:14b"}` | Resolved model name |
| `tool_call` | `{"name": "list_tasks", "args": {...}}` | Tool being called |
| `tool_result` | `{"name": "list_tasks", "result": {...}}` | Tool response |
| `answer` | `{"answer": "Here's what I suggest..."}` | Final answer |
| `error` | `{"detail": "Error message"}` | Execution error |

## Skills

### List Skills

```
GET /api/advisor/skills
```

### Create Skill

```
POST /api/advisor/skills
```

**Body:**

```json
{
  "name": "standup",
  "content": "List what I did yesterday, what I'm doing today..."
}
```

### Update Skill

```
PUT /api/advisor/skills/{name}
```

Same body as create.

### Delete Skill

```
DELETE /api/advisor/skills/{name}
```
