# Kaisho Desktop App

Tauri v2 wrapper that opens Kaisho in a native window
without a terminal. Supported platforms: macOS (Apple
Silicon), Windows, and Linux. No Intel Mac build.

Auto-starts the backend via a bundled sidecar binary on
launch and stops it when you close the window. Includes
an auto-updater that checks for new releases via
`latest.json` on GitHub Releases.

## Architecture

```
Tauri App (native window)
  |
  +-- Splash screen (polls http://127.0.0.1:8765)
  |
  +-- Webview -> http://127.0.0.1:8765 once ready
  |
  +-- Sidecar: kai-server (bundled binary)
        |
        +-- FastAPI on :8765 (API + built frontend)
  |
  +-- Auto-updater plugin (latest.json endpoint)
```

The window shows the Kaisho splash screen until the
backend responds, then navigates to the served frontend.
Closing the window kills the sidecar process.

The sidecar binary (`binaries/kai-server`) is bundled
into the app at build time via Tauri's `externalBin`
mechanism.

## Prerequisites

- Rust toolchain (via [rustup.rs](https://rustup.rs))
- Node.js 20+ and pnpm

## Development

```bash
cd desktop
pnpm install
pnpm dev
```

First launch takes a minute while Rust compiles Tauri.
After that, `pnpm dev` opens the native window in a few
seconds.

## Production Build

```bash
cd desktop
pnpm build
```

On macOS this produces
`src-tauri/target/release/bundle/macos/Kaisho.app`.
On Windows and Linux, the corresponding platform bundles
are created in the same `bundle/` directory.

## Auto-Updater

The app checks for updates on startup via the endpoint
configured in `tauri.conf.json`:

```
https://github.com/ridingbytes/kaisho/releases/latest/download/latest.json
```

The `latest.json` file contains version, release notes,
and download URLs for each platform. The updater plugin
verifies signatures using the public key in the config.

## Files

```
desktop/
  package.json               Tauri CLI script wrapper
  src/
    index.html               Splash screen
    splash.css
    splash.js                Polls backend, redirects
  src-tauri/
    Cargo.toml
    tauri.conf.json          Window, sidecar, updater
    src/
      main.rs                Entry point
      lib.rs                 Sidecar lifecycle, updater
    capabilities/default.json
    icons/                   Generated from logo SVG
```
