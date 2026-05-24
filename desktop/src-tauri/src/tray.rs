//! System tray icon and popover panel.
//!
//! Left-click toggles the popover panel, right-click
//! shows the context menu (Open, Start/Stop, Quit).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

use crate::http;

const TRAY_ID: &str = "kaisho-tray";
const PANEL_WIDTH: f64 = 320.0;
const PANEL_HEIGHT: f64 = 480.0;

/// Snapshot of the currently running timer, pushed by
/// the frontend on start / stop. The Rust ticker
/// recomputes elapsed from ``start_secs`` so the menu
/// bar stays current even when every webview is
/// suspended in the background (where ``setInterval``
/// is throttled or paused).
#[derive(Clone)]
struct TimerInfo {
    start_secs: i64,
    label: String,
}

static TIMER_STATE: Mutex<Option<TimerInfo>> =
    Mutex::new(None);
static OFFLINE: AtomicBool = AtomicBool::new(false);

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn format_hhmm(total_minutes: i64) -> String {
    let m = total_minutes.max(0);
    format!("{:02}:{:02}", m / 60, m % 60)
}

// -----------------------------------------------------------
// Icon bytes (embedded at compile time)
// -----------------------------------------------------------

// macOS: 22x22 template images (black on transparent,
//   auto-adapts to menu bar light/dark)
// Windows/Linux: 32x32 colored icons (white on dark
//   background, visible on any taskbar)
#[cfg(target_os = "macos")]
mod icons {
    pub const IDLE: &[u8] =
        include_bytes!("../icons/tray-idle.png");
    pub const ACTIVE: &[u8] =
        include_bytes!("../icons/tray-active.png");
    pub const LONG: &[u8] =
        include_bytes!("../icons/tray-long.png");
    pub const OFFLINE: &[u8] =
        include_bytes!("../icons/tray-offline.png");
}

#[cfg(not(target_os = "macos"))]
mod icons {
    pub const IDLE: &[u8] =
        include_bytes!("../icons/tray-idle-32.png");
    pub const ACTIVE: &[u8] =
        include_bytes!("../icons/tray-active-32.png");
    pub const LONG: &[u8] =
        include_bytes!("../icons/tray-long-32.png");
    pub const OFFLINE: &[u8] =
        include_bytes!("../icons/tray-offline-32.png");
}

// -----------------------------------------------------------
// Public API
// -----------------------------------------------------------

/// Register the system tray icon with its menu and
/// click handlers.
pub fn setup(
    app: &tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    let open = MenuItemBuilder::with_id(
        "open", "Open Kaisho",
    )
    .build(app)?;
    let toggle = MenuItemBuilder::with_id(
        "toggle_timer", "Start / Stop Timer",
    )
    .build(app)?;
    let quit = MenuItemBuilder::with_id(
        "quit", "Quit",
    )
    .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open)
        .item(&toggle)
        .separator()
        .item(&quit)
        .build()?;

    let icon = Image::from_bytes(icons::IDLE)?;

    let handle_menu = handle.clone();
    let handle_click = handle.clone();

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Kaisho \u{2014} no active timer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |_app, event| {
            match event.id().as_ref() {
                "open" => {
                    super::show_main_window(
                        handle_menu.clone(),
                    );
                }
                "toggle_timer" => {
                    super::toggle_timer(
                        handle_menu.clone(),
                    );
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(move |_tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button:
                    tauri::tray::MouseButton::Left,
                button_state:
                    tauri::tray::MouseButtonState::Up,
                position,
                ..
            } = event
            {
                toggle_window(
                    &handle_click,
                    Some(position),
                );
            }
        })
        .build(app)?;

    Ok(())
}

/// Switch the tray icon, tooltip, and (macOS only) the
/// inline title text shown next to the icon in the menu
/// bar. Pass an empty title to clear it.
///
/// On macOS, the active/long/offline icons render in
/// their own brand colours (green/amber/red) so they
/// stay readable across light, dark, and Sequoia's
/// wallpaper-tinted menu bars. Only ``idle`` keeps the
/// template flag — it then adapts to the menu bar's
/// foreground colour and recedes unobtrusively when no
/// timer is running.
pub fn update_icon(
    app: &tauri::AppHandle,
    state: &str,
    tooltip: &str,
    title: &str,
) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    let _ = tray.set_tooltip(Some(tooltip));

    // Try the modern pill renderer first. Treat an empty
    // title as "00:00" so the idle pill is always shown
    // even when an older callsite forgets to populate it.
    // Falls back to the static template-icon + text-title
    // path on any failure so the menu bar is never blank.
    let display_title = if title.is_empty() {
        "00:00"
    } else {
        title
    };
    if let Some(png) = super::tray_render::render_pill(
        state, display_title,
    ) {
        if let Ok(img) = Image::from_bytes(&png) {
            let _ = tray.set_icon(Some(img));
            // The pill bakes the time into the icon, so
            // clear the OS-rendered title and don't draw
            // it as a template (we want our brand colours).
            #[cfg(target_os = "macos")]
            {
                let _ = tray.set_icon_as_template(false);
                let _ = tray.set_title(None::<String>);
            }
            return;
        }
    }

    // Fallback path: static icon + Tauri text title.
    let bytes = match state {
        "active" => icons::ACTIVE,
        "long" => icons::LONG,
        "offline" => icons::OFFLINE,
        _ => icons::IDLE,
    };
    let is_template = state == "idle";
    if let Ok(img) = Image::from_bytes(bytes) {
        let _ = tray.set_icon(Some(img));
    }
    #[cfg(target_os = "macos")]
    {
        let _ = tray.set_icon_as_template(is_template);
        let value = if title.is_empty() {
            None
        } else {
            Some(title)
        };
        let _ = tray.set_title(value);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = title;
        let _ = is_template;
    }
}

/// Set the active-timer snapshot. The Rust-side ticker
/// uses ``start_secs`` (Unix epoch seconds) to recompute
/// elapsed every 30 seconds, so the menu bar updates
/// even when the main window is suspended and its
/// JavaScript timer is throttled or paused. Pushes one
/// refresh immediately so the user sees the new state
/// without waiting for the next tick.
pub fn set_active_timer(
    app: &tauri::AppHandle,
    start_secs: i64,
    label: String,
) {
    if let Ok(mut g) = TIMER_STATE.lock() {
        *g = Some(TimerInfo { start_secs, label });
    }
    refresh_from_state(app);
}

/// Drop the active-timer snapshot; menu bar reverts to
/// the idle pill.
pub fn clear_active_timer(app: &tauri::AppHandle) {
    if let Ok(mut g) = TIMER_STATE.lock() {
        *g = None;
    }
    refresh_from_state(app);
}

/// Mark the backend connection as reachable or offline.
/// When offline, the ticker pushes the red icon and
/// skips the active-timer refresh so the offline state
/// isn't overwritten by a stale timer snapshot.
pub fn set_offline(app: &tauri::AppHandle, offline: bool) {
    OFFLINE.store(offline, Ordering::Relaxed);
    refresh_from_state(app);
}

/// Recompute and push icon + tooltip + title from the
/// in-process timer / offline state. Called by the
/// setters above and by the background ticker.
fn refresh_from_state(app: &tauri::AppHandle) {
    if OFFLINE.load(Ordering::Relaxed) {
        update_icon(
            app,
            "offline",
            "Kaisho \u{2014} backend offline",
            "",
        );
        return;
    }
    let snapshot = TIMER_STATE.lock().ok().and_then(
        |g| g.clone(),
    );
    match snapshot {
        Some(info) => {
            let minutes =
                ((now_unix() - info.start_secs).max(0))
                    / 60;
            let hours = minutes / 60;
            let state =
                if hours > 8 { "long" } else { "active" };
            let title = format_hhmm(minutes);
            let suffix =
                if hours > 8 { " (long)" } else { "" };
            let tooltip = format!(
                "{} \u{2014} {}{}",
                info.label, title, suffix,
            );
            update_icon(app, state, &tooltip, &title);
        }
        None => {
            update_icon(
                app,
                "idle",
                "Kaisho \u{2014} no active timer",
                "00:00",
            );
        }
    }
}

/// Fetch the running timer from the backend and update
/// the in-process snapshot. Called periodically by the
/// ticker so the tray self-heals when the frontend's
/// transition push is missed (e.g. after auto-update
/// restart). Errors are swallowed; the previous state
/// stays in place until the next attempt succeeds.
fn self_heal_from_backend() {
    let body = match http::get("/api/clocks/active") {
        Ok(b) => b,
        Err(_) => return,
    };
    let value: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return,
    };
    let active = value
        .get("active")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let next = if active {
        // The backend's ``start`` field is a naive local
        // ISO string; parsing it manually is timezone-
        // unsafe (would land in the future for users
        // east of UTC and clamp elapsed to 0). The
        // ``start_unix`` field is the canonical
        // epoch-seconds version computed server-side
        // with the local zone correctly applied.
        let start_secs = value
            .get("start_unix")
            .and_then(Value::as_i64);
        let label = value
            .get("customer")
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Kaisho".to_string());
        match start_secs {
            Some(start_secs) => Some(TimerInfo {
                start_secs,
                label,
            }),
            None => return,
        }
    } else {
        None
    };
    if let Ok(mut g) = TIMER_STATE.lock() {
        *g = next;
    }
    // The backend answered, so we're online -- flip the
    // offline flag if it was set. Avoids the menu bar
    // sitting red after a transient blip even when
    // nothing else updates it.
    OFFLINE.store(false, Ordering::Relaxed);
}

/// Spawn the background ticker that refreshes the menu
/// bar in sync with the minute boundary so the tray pill
/// flips to a new HH:MM at the same moment the main
/// window's per-second clock does. Without alignment,
/// the tray could lag by up to one tick interval and
/// show "4" while the main app shows "5".
pub fn spawn_ticker(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            // Re-query the backend each tick so the
            // tray self-heals when the frontend's
            // transition push is missed (e.g. when the
            // main window mounts during the brief
            // backend-respawn window after auto-update
            // and never sees the active timer
            // transition). The frontend's set_/clear_
            // calls remain the fast path for instant
            // reaction; this is the slow safety net.
            // Wrapped in the same panic guard as the
            // refresh below so a bad response or socket
            // hiccup doesn't kill the ticker.
            let _ = std::panic::catch_unwind(
                std::panic::AssertUnwindSafe(
                    self_heal_from_backend,
                ),
            );
            // Wrap the refresh in catch_unwind so a panic
            // in the renderer (e.g. an edge case in the
            // pill bitmap path) just skips this tick
            // instead of killing the whole ticker task.
            // Without this guard a single bad frame
            // freezes the menu-bar pill indefinitely
            // until the user restarts the app.
            let app_for_refresh = app.clone();
            let result = std::panic::catch_unwind(
                std::panic::AssertUnwindSafe(|| {
                    refresh_from_state(&app_for_refresh)
                }),
            );
            if result.is_err() {
                eprintln!(
                    "[tray] ticker refresh panicked; \
                     skipping this tick",
                );
            }
            // Sleep until just after the next wall-clock
            // minute. Add 250ms slack so the minute has
            // definitively turned by the time we read
            // ``now_unix`` again.
            let now = now_unix();
            let secs_until_next_minute =
                60 - (now.rem_euclid(60)) as u64;
            tokio::time::sleep(
                Duration::from_secs(secs_until_next_minute)
                    + Duration::from_millis(250),
            )
            .await;
        }
    });
}

/// Toggle the tray popover window. Shows it centered
/// below the click position, or hides it if already
/// visible.
pub fn toggle_window(
    app: &tauri::AppHandle,
    position: Option<
        tauri::PhysicalPosition<f64>,
    >,
) {
    let Some(win) =
        app.get_webview_window("tray")
    else {
        return;
    };

    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        return;
    }

    position_panel(&win, position);

    let _ = win.show();

    // Delay focus slightly so macOS does not bring the
    // main window to the foreground first.
    let w = win.clone();
    std::thread::spawn(move || {
        std::thread::sleep(
            Duration::from_millis(100),
        );
        let _ = w.set_focus();
    });
}

// -----------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------

/// Place the panel near the tray icon click position.
///
/// On macOS the menu bar is at the top, so the panel
/// opens below the click. On Windows/Linux the taskbar
/// is typically at the bottom, so the panel opens above.
fn position_panel(
    win: &tauri::WebviewWindow,
    position: Option<
        tauri::PhysicalPosition<f64>,
    >,
) {
    let sf = win.scale_factor().unwrap_or(2.0);
    let panel_w = PANEL_WIDTH * sf;
    let panel_h = PANEL_HEIGHT * sf;

    let screen_h = win
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.size().height as f64)
        .unwrap_or(1080.0 * sf);

    if let Some(pos) = position {
        let x = (pos.x - panel_w / 2.0).max(0.0);

        // If the click is in the lower half of the
        // screen (Windows/Linux bottom taskbar), open
        // the panel above the click position.
        let y = if pos.y > screen_h / 2.0 {
            (pos.y - panel_h).max(0.0)
        } else {
            pos.y
        };

        let _ = win.set_position(
            tauri::Position::Physical(
                tauri::PhysicalPosition {
                    x: x as i32,
                    y: y as i32,
                },
            ),
        );
        return;
    }

    // Fallback: near the top-right corner
    if let Some(m) =
        win.primary_monitor().ok().flatten()
    {
        let x = m.size().width as i32
            - panel_w as i32
            - 20;
        let _ = win.set_position(
            tauri::Position::Physical(
                tauri::PhysicalPosition {
                    x: x.max(0),
                    y: (30.0 * sf) as i32,
                },
            ),
        );
    }
}
