# Cron API

Scheduled AI job management.

**Prefix:** `/api/cron`

## Templates

### List Templates

```
GET /api/cron/templates
```

Returns the curated cron job templates. Each entry has
metadata (description, category, requires_tools,
default_inject_context) plus the prompt body. Used by the
desktop "From Template" picker and the advisor's
`create_cron_from_template` MCP tool.

### Get Template

```
GET /api/cron/templates/{template_id}
```

Returns 404 if the template id is unknown.

## Jobs

### List Jobs

```
GET /api/cron/jobs
```

### Get Job

```
GET /api/cron/jobs/{job_id}
```

### Create Job

```
POST /api/cron/jobs
```

**Body:**

```json
{
  "id": "weekly-report",
  "name": "Weekly Report",
  "schedule": "0 17 * * 5",
  "model": "ollama:qwen3:14b",
  "prompt_file": "prompts/weekly-report.md",
  "prompt_content": null,
  "output": "inbox",
  "timeout": 600,
  "enabled": true
}
```

### Update Job

```
PATCH /api/cron/jobs/{job_id}
```

All fields optional.

### Delete Job

```
DELETE /api/cron/jobs/{job_id}
```

### Enable / Disable

```
POST /api/cron/jobs/{job_id}/enable
POST /api/cron/jobs/{job_id}/disable
```

### Trigger (Run Now)

```
POST /api/cron/jobs/{job_id}/trigger
```

Returns 202 with `{"run_id": "...", "status": "started"}`.

### Get Prompt

```
GET /api/cron/jobs/{job_id}/prompt
```

### Save Prompt

```
PUT /api/cron/jobs/{job_id}/prompt
```

**Body:** `{"content": "Prompt text..."}`

## History

### List History

```
GET /api/cron/history?job_id=weekly-report&limit=50
```

### Get History Entry

```
GET /api/cron/history/{entry_id}
```

### Delete History Entry

```
DELETE /api/cron/history/{entry_id}
```

### Move Output

Move a cron run's output to another destination.

```
POST /api/cron/history/{entry_id}/move
```

**Body:**

```json
{
  "destination": "inbox",
  "customer": "Acme Corp",
  "filename": "report.md"
}
```

Destinations: `inbox`, `todo`, `note`, `kb`.
