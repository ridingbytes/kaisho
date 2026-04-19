# Menu Bar Timer — Design Plan

A system tray icon that gives quick access to the most
common kaisho operations without opening the main window.

## Overview

The tray lives in the macOS menu bar (and Windows/Linux
system tray). It shows the current timer state at a
glance and opens a small popover panel for actions.

The tray communicates with the same `kai serve` backend
on localhost:8765 — no separate server or process needed.

## Tray icon states

| State | Icon | Tooltip |
|---|---|---|
| No timer running | Clock outline (grey) | "Kaisho — no active timer" |
| Timer running | Clock filled (green) | "Acme Corp — 1:23:45" |
| Timer running > 8h | Clock filled (amber) | "Acme Corp — 8:15:00 (long)" |
| Backend not running | Clock with X (red) | "Kaisho — backend offline" |

The tooltip updates every 60 seconds via the tray API.
The icon switches between the three states based on
polling `/api/clocks/active` every 5 seconds.

## Popover panel

A small window (320 x 480 px) anchored to the tray icon.
Opens on left-click (macOS) or left-click (Windows/Linux).
Closes on click-outside or Escape.

### Layout (top to bottom)

```
┌──────────────────────────────┐
│  ● 01:23:45                  │  <- elapsed (large)
│  Acme Corp / Maintenance     │  <- customer / contract
│  Fix login redirect          │  <- description
│  [Stop]                      │  <- primary action
├──────────────────────────────┤
│  Quick start                 │
│  ┌────────────────────────┐  │
│  │ Customer (combobox)    │  │
│  │ Description (input)    │  │
│  │ [Start]                │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│  Quick capture               │
│  ┌────────────────────────┐  │
│  │ ☐ Note  ☐ Task  ☐ Inbox│  │
│  │ Text (input)           │  │
│  │ [Add]                  │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│  Recent (last 3 entries)     │
│  09:00–12:30  Acme  3h30m  ▶│  <- resume button
│  13:00–14:00  Beta  1h00m  ▶│
│  14:30–16:00  Acme  1h30m  ▶│
├──────────────────────────────┤
│  Today: 6h 00m               │
│  ──────────────────────────  │
│  [Open Kaisho]  [Settings]   │
└──────────────────────────────┘
```

When no timer is running, the top section shows the
"Quick start" form instead of the elapsed timer.

### Features

**Timer control**
- Start: select customer (combobox with recent-first),
  optional description, optional contract
- Stop: single button, shows completed entry briefly
- Resume: play icon on recent entries pre-fills and
  starts

**Quick capture**
- Toggle between Note, Task, and Inbox
- Single text input + Add button
- Calls `POST /api/notes`, `POST /api/kanban/tasks`,
  or `POST /api/inbox/capture`
- Toast confirmation (brief, in the popover)

**Edit running timer**
- Click the description line to edit inline
- Click the customer line to change customer/contract
- Changes are sent via `PATCH /api/clocks/entries`

**Recent entries**
- Last 3 completed entries from today
- Shows time range, customer, duration
- Resume button starts a new timer with the same fields

**Today summary**
- Total hours today at the bottom
- Links to open the main Kaisho window

## Implementation

### Rust (Tauri)

**Tray setup** (`lib.rs`):
- Register `SystemTray` with default icon
- On tray click: toggle popover window visibility
- Popover window config:
  - `decorations: false` (no title bar)
  - `always_on_top: true`
  - `skip_taskbar: true`
  - `width: 320, height: 480`
  - Position: anchored below the tray icon

**IPC commands:**
- `get_tray_state` — returns active timer + recent
  entries + today total (single call for the popover)
- `update_tray_icon` — switches icon based on timer
  state (called from the popover JS after each poll)

**Icon assets:**
- `tray-idle.png` — grey clock outline (template image
  on macOS for dark/light menu bar)
- `tray-active.png` — green filled clock
- `tray-long.png` — amber filled clock
- `tray-offline.png` — red clock with X

All icons as 22x22 PNG @2x (44x44) for retina.

### Frontend (React)

**New entry point:** `frontend/src/tray/TrayPanel.tsx`

A lightweight React app rendered in the popover window.
Separate from the main app — does not import the full
component tree. Shares API client and locale files.

**File structure:**
```
frontend/src/tray/
  TrayPanel.tsx        # Root component
  TimerSection.tsx     # Active timer or start form
  CaptureSection.tsx   # Quick note/task/inbox
  RecentSection.tsx    # Last 3 entries with resume
  tray.css             # Compact styles
```

**API calls (all to localhost:8765):**
- `GET /api/clocks/active` — poll every 5s
- `GET /api/clocks/entries?period=today` — recent list
- `POST /api/clocks/start` — start timer
- `POST /api/clocks/stop` — stop timer
- `PATCH /api/clocks/entries?start=...` — edit entry
- `POST /api/notes` — quick note
- `POST /api/kanban/tasks` — quick task
- `POST /api/inbox/capture` — quick inbox item
- `GET /api/customers` — customer list for combobox

### Build

The tray panel is a second Vite entry point:

```js
// vite.config.ts
build: {
  rollupOptions: {
    input: {
      main: "index.html",
      tray: "tray.html",
    },
  },
}
```

`tray.html` is a minimal HTML file that loads
`TrayPanel.tsx`. The main window and tray panel share
the same build but have separate entry points.

### Tauri config

```json
{
  "windows": [
    {
      "label": "main",
      "title": "Kaisho",
      "width": 1400,
      "height": 900
    },
    {
      "label": "tray",
      "url": "tray.html",
      "visible": false,
      "decorations": false,
      "alwaysOnTop": true,
      "skipTaskbar": true,
      "width": 320,
      "height": 480,
      "resizable": false
    }
  ]
}
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+T` | Toggle tray popover |
| `Cmd+Shift+S` | Start/stop timer |
| `Escape` | Close popover |

Global shortcuts registered via Tauri's
`register_global_shortcut` API so they work even
when the main window is not focused.

## Platform notes

**macOS:** Use template images for the tray icon so
it adapts to dark/light menu bar. The popover should
appear directly below the tray icon.

**Windows:** System tray icon with left-click to open
the popover window. Position near the system clock.

**Linux:** Depends on desktop environment. Tauri's
tray support covers GNOME, KDE, and XFCE via
`libappindicator`.

## Phases

1. **Tray icon + timer status** — icon changes based
   on timer state, tooltip shows elapsed time. No
   popover yet, just right-click menu with Start/Stop.

2. **Popover panel** — full UI with timer control,
   customer picker, recent entries, resume.

3. **Quick capture** — note/task/inbox from the
   menu bar.

4. **Global shortcuts** — Cmd+Shift+T/S.

5. **Edit inline** — tap description/customer to edit
   the running timer from the popover.

## Dependencies

- `tauri-plugin-global-shortcut` (already available
  in Tauri v2)
- No new npm dependencies — reuses existing API
  client and locale files

## Open questions

1. Should the main window and tray share the same
   backend process, or should the tray be a standalone
   app that connects to a running kaisho instance?
   **Recommendation:** shared process (current Tauri
   app already manages the sidecar).

2. Should the tray icon persist when the main window
   is closed? **Recommendation:** yes, the tray stays
   active. Closing the main window hides it; the tray
   icon remains. Click the tray to reopen the main
   window. Quit via tray right-click menu.

3. Should the tray work without the main window ever
   opening? **Recommendation:** yes, for users who
   only need timer control. The sidecar starts on
   app launch regardless of window visibility.
