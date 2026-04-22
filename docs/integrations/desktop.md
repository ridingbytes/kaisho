# Desktop App

The desktop app wraps Kaisho in a native window with a menu bar tray
timer and automatic updates. It bundles the Python backend as a
sidecar process -- no separate installation needed.

## Installation

Download the latest release from
[GitHub Releases](https://github.com/ridingbytes/kaisho/releases):

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| Windows | `.exe` installer |
| Linux | `.AppImage` |

## Menu Bar Tray

The tray icon sits in the menu bar (macOS) or system tray
(Windows/Linux). It shows the timer state:

| State | Icon |
|-------|------|
| Idle | Default icon |
| Timer running | Active indicator |
| Running long (>8h) | Warning indicator |
| Backend offline | Offline indicator |

**Left-click** opens a popover panel with:

- Active timer with elapsed time and stop button
- Quick-start buttons for recent customers
- Quick capture (inbox item, note, task)
- Recent clock entries with resume buttons

**Right-click** shows a context menu.

## Tray Mode

By default on macOS, closing the main window hides it while the
tray stays active. On Windows and Linux, this is opt-in.

Configure in **Settings > General > Tray Mode**:

- **On**: closing the window hides it; tray stays active
- **Off**: closing the window quits the app

## Global Shortcuts

| Shortcut | Action |
|----------|--------|
| ++cmd+shift+t++ | Toggle tray panel |
| ++cmd+shift+s++ | Start/stop timer |

## Auto-Update

The app checks for updates on startup. When a new version is
available, a banner appears with an install button. Updates download
and install in the background.

The updater uses signed releases from GitHub. Update prompts only
appear for versions newer than the installed one.

## Sidecar

The Python backend runs as a sidecar process managed by Tauri. It
starts automatically when the app launches and stops when the app
quits. The sidecar binary is cached based on a content hash to avoid
stale builds.

## Platform Notes

**macOS**: Template tray icons adapt to light/dark menu bar. The dock
icon uses the Kaisho bracket-palm design with proper padding.

**Windows**: Colored 32x32 tray icons (white on dark background).
NSIS installer with per-user or system-wide installation. Properly
signed `.exe` for Windows Defender.

**Linux**: AppImage format. Colored tray icons. Tray panel opens
above the bottom taskbar.
