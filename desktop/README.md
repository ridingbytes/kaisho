# Kaisho Desktop App

Tauri v2 wrapper that opens Kaisho in a native macOS window
without a terminal. Auto-starts `kai serve` on launch and
stops it when you close the window.

## Architecture

```
Tauri App (native window)
  |
  +-- Splash screen (polls http://localhost:8765/health)
  |
  +-- Webview -> http://localhost:8765 once ready
  |
  +-- Child process: `kai serve`
        |
        +-- FastAPI on :8765 (API + built frontend)
```

The window shows the Kaisho splash screen until the backend
responds on `/health`, then redirects to the served frontend.
Closing the window kills the child process.

No sidecar binary, no auto-updater — the app relies on a
working `kai` CLI being installed and on your PATH.

## Prerequisites

- Rust toolchain (via [rustup.rs](https://rustup.rs))
- Node.js 20+ and pnpm
- `kai` CLI installed (`pip install -e ..` from the kaisho
  repo root)

## Development

```bash
cd desktop
pnpm install
pnpm dev
```

First launch takes a minute while Rust compiles Tauri. After
that, `pnpm dev` opens the native window in a few seconds.

## Production Build

```bash
cd desktop
pnpm build
```

Produces `src-tauri/target/release/bundle/macos/Kaisho.app`
which you can drag into /Applications.

### Caveat: pyenv + Finder launch

Apps launched from Finder don't inherit your shell PATH, so
pyenv shims may not resolve. If `kai` is only available
through pyenv, the bundled app will fail to spawn the backend.

Workarounds:
- Launch from terminal: `open src-tauri/target/release/bundle/macos/Kaisho.app`
- Hardcode the full path to `kai` in `src-tauri/src/lib.rs`
- Install `kai` to a system-wide location like `/usr/local/bin`

## Files

```
desktop/
  package.json               Tauri CLI script wrapper
  src/
    index.html               Splash screen
    splash.css
    splash.js                Polls /health, redirects on ready
  src-tauri/
    Cargo.toml
    tauri.conf.json          Window size, identifier, icons
    src/
      main.rs                Entry point
      lib.rs                 App setup, kai process lifecycle
    capabilities/default.json
    icons/                   Generated from logos/kaisho-logo.svg
```
