# Environment Variables

Kaisho reads configuration from environment variables, a `.env` file,
and the profile's `settings.yaml`. Environment variables take
precedence.

## Core Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KAISHO_HOME` | `~/.kaisho` | Root data directory |
| `PROFILE` | (from `.active_profile`) | Active profile name |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8765` | Server port |
| `SERVE_FRONTEND` | `false` | Serve bundled frontend |
| `CORS_ORIGINS` | localhost ports | Allowed CORS origins |

## Path Overrides

| Variable | Default | Description |
|----------|---------|-------------|
| `ORG_DIR` | `data/org` | Org-mode files directory |
| `MARKDOWN_DIR` | `data/markdown` | Markdown files directory |
| `JSON_DIR` | `data/json` | JSON files directory |
| `SQL_DSN` | | SQLAlchemy connection string |

## AI Provider Variables

These can also be set in `settings.yaml` per profile:

| Variable | Description |
|----------|-------------|
| `OLLAMA_BASE_URL` | Local Ollama instance URL |

## Data Directory Resolution

Kaisho determines the data directory in this order:

1. `KAISHO_HOME` environment variable (if set)
2. `~/.kaisho` (if the directory exists)
3. `./data` (fallback for development)

## .env File

Place a `.env` file in the project root for development:

```bash
# .env
KAISHO_HOME=~/.kaisho
HOST=127.0.0.1
PORT=8765
CORS_ORIGINS=http://localhost:5173,http://localhost:8765
```

Pydantic-settings loads this automatically.
