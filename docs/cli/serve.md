# kai serve

Start the Kaisho API server.

## Usage

```bash
kai serve [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--host` | Bind address (default from config) |
| `--port` | Port number (default: 8765) |
| `--reload` | Auto-reload on file changes (development) |

## Examples

```bash
kai serve                              # default: 0.0.0.0:8765
kai serve --port 9000                  # custom port
kai serve --host 127.0.0.1 --reload   # dev mode, localhost only
```

The server starts the FastAPI backend and serves the frontend SPA
(if built). It also initializes the cron scheduler and file watchers.
