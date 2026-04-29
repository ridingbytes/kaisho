# Settings API

Configuration management endpoints.

**Prefix:** `/api/settings`

## General Settings

### Get All Settings

```
GET /api/settings
```

Returns the complete settings object.

### Paths and Backend

```
GET /api/settings/paths
PATCH /api/settings/paths
```

**Body:**

```json
{
  "org_dir": "~/org",
  "markdown_dir": "~/markdown",
  "backend": "org"
}
```

### Switch Backend

```
PUT /api/settings/backend
```

**Body:** `{"backend": "org"}` (org, markdown, json, sql)

### Import Data

```
POST /api/settings/import-data
```

**Body:**

```json
{
  "source_format": "markdown",
  "source_path": "~/old-data/markdown"
}
```

## AI Settings

### Get AI Config

```
GET /api/settings/ai
```

### Update AI Config

```
PATCH /api/settings/ai
```

**Body** (all fields optional):

```json
{
  "ollama_url": "http://localhost:11434",
  "ollama_cloud_url": "https://ollama.com",
  "ollama_api_key": "your-key",
  "lm_studio_url": "http://localhost:1234",
  "claude_api_key": "sk-ant-...",
  "openrouter_url": "https://openrouter.ai/api/v1",
  "openrouter_api_key": "sk-or-...",
  "openai_url": "https://api.openai.com",
  "openai_api_key": "sk-...",
  "brave_api_key": "...",
  "tavily_api_key": "...",
  "advisor_model": "ollama:qwen3:14b",
  "cron_model": "ollama:gemma4:latest"
}
```

### Available Models

```
GET /api/settings/ai/models
```

Queries all configured providers and returns available models.

### Provider Probe

```
GET /api/settings/ai/probe
```

Returns reachability status for each provider.

### Claude CLI Status

```
GET /api/settings/ai/claude_cli
```

## GitHub Settings

```
GET /api/settings/github
PATCH /api/settings/github
```

**Body:** `{"token": "ghp_...", "base_url": "https://api.github.com"}`

## KB Sources

```
GET /api/settings/kb_sources
PUT /api/settings/kb_sources
```

**Body:** Array of `{"label": "...", "path": "..."}` objects.

## Advisor Personality Files

```
GET /api/settings/advisor_files
PUT /api/settings/advisor_files
```

**Body:** `{"soul": "SOUL.md content...", "user": "USER.md content..."}`

## Backup Settings

```
GET /api/settings/backup
PATCH /api/settings/backup
```

**Body:** `{"directory": "~/.kaisho/backups", "keep": 5, "interval_hours": 24}`

## Invoice Export

```
GET /api/settings/invoice_export
PATCH /api/settings/invoice_export
```

## URL Allowlist

```
GET /api/settings/url_allowlist
PUT /api/settings/url_allowlist
```

**Body:** Array of URL strings.

## States and Tags

### Task States

```
POST /api/settings/states
PATCH /api/settings/states/{name}
DELETE /api/settings/states/{name}
PUT /api/settings/states/order
```

### Tags

```
POST /api/settings/tags
PATCH /api/settings/tags/{name}
DELETE /api/settings/tags/{name}
```

### Custom Types

```
POST /api/settings/customer_types
DELETE /api/settings/customer_types/{name}

POST /api/settings/inbox_types
DELETE /api/settings/inbox_types/{name}

POST /api/settings/inbox_channels
DELETE /api/settings/inbox_channels/{name}
```

## Profiles

```
GET /api/settings/user
PATCH /api/settings/user/profile
GET /api/settings/profiles
PUT /api/settings/profile
POST /api/settings/profiles
PUT /api/settings/profiles/{name}
POST /api/settings/profiles/{name}/copy
DELETE /api/settings/profiles/{name}
```

## Version

```
GET /api/version
```

**Response:**

```json
{
  "version": "1.1.0",
  "changelog": "..."
}
```
