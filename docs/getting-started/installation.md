# Installation

Kaisho runs as a Python package. You need Python 3.12 or newer.

## From Source (Recommended for Development)

Clone the repository and install in editable mode:

```bash
git clone https://github.com/ridingbytes/kaisho.git
cd kaisho
pip install -e .
```

Verify the installation:

```bash
kai --help
```

You should see the list of available commands.

## With Docker

If you prefer containers, run the full stack with one command:

```bash
docker compose up --build
```

This starts the backend on port `8765` with the frontend bundled in.
Your data persists in a Docker volume.

To use a local directory for data instead:

```yaml
# docker-compose.override.yml
services:
  kaisho:
    volumes:
      - ./my-data:/app/data
```

## Desktop App

Download the latest release from
[GitHub Releases](https://github.com/ridingbytes/kaisho/releases).
The desktop app bundles the Python backend as a sidecar process --
no separate installation needed.

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| Windows | `.exe` (NSIS installer) |
| Linux | `.AppImage` |

## Frontend Development

The frontend is a separate Vite project. To work on it:

```bash
cd frontend
pnpm install
pnpm dev
```

This starts the Vite dev server on `localhost:5173`, proxying API
calls to the backend on `localhost:8765`.

## Dependencies

Kaisho's Python dependencies install automatically:

| Package | Purpose |
|---------|---------|
| FastAPI + Uvicorn | HTTP server |
| Click | CLI framework |
| Pydantic | Data validation and settings |
| APScheduler | Cron job scheduling |
| SQLAlchemy | SQL storage backend |
| PyYAML | Configuration files |
| pypdf | PDF text extraction |

Optional system dependency for better PDF extraction:

```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt install poppler-utils
```

## What's Next

Once installed, head to [Quick Start](quickstart.md) to create your
first profile and start tracking time.
