# Kaisho Desktop App

Tauri v2 wrapper that bundles the Kaisho backend as a
sidecar process and displays the web dashboard in a native
window.

## Architecture

```
Tauri App
  |
  +-- Webview (loads http://localhost:8765)
  |
  +-- Sidecar: kai-server (PyInstaller binary)
        |
        +-- FastAPI/Uvicorn (port 8765)
        +-- Frontend (static files from frontend/dist)
```

On startup, Tauri spawns the `kai-server` sidecar binary,
waits for port 8765 to become available, then loads the URL
in the webview. On app close, the sidecar is terminated.

## Auto-Update

The app checks for updates on startup via the Tauri updater
plugin. The update endpoint points to GitHub Releases:

```
https://github.com/ridingbytes/kaisho/releases/latest/download/update.json
```

When a new release is published, the CI workflow builds
Tauri bundles for all platforms and attaches them to the
GitHub Release along with an `update.json` manifest.

## Prerequisites

- Rust (install via rustup.rs)
- Node.js 20+ and pnpm
- Python 3.12+ and pip
- PyInstaller (`pip install pyinstaller`)

## Development

```bash
# 1. Build the sidecar (one-time or after backend changes)
bash scripts/build-sidecar.sh

# 2. Run Tauri in dev mode
cd desktop
npx tauri dev
```

In dev mode, Tauri connects to the Vite dev server at
localhost:5173. You still need to start the backend
separately with `kai serve`.

## Production Build

```bash
# Build everything (sidecar + frontend + Tauri bundle)
bash scripts/build-sidecar.sh
cd desktop
npx tauri build
```

The output bundle is in `desktop/src-tauri/target/release/bundle/`.

## CI/CD

The GitHub Actions workflow at `.github/workflows/build-desktop.yml`
builds the desktop app for all platforms on each GitHub Release.

Required secrets:
- `TAURI_SIGNING_PRIVATE_KEY` -- for update signature
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Generate a signing key pair:
```bash
npx tauri signer generate -w ~/.tauri/kaisho.key
```
