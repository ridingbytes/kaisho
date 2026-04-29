//! System tray icon and popover panel.
//!
//! Left-click toggles the popover panel, right-click
//! shows the context menu (Open, Start/Stop, Quit).

use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

const TRAY_ID: &str = "kaisho-tray";
const PANEL_WIDTH: f64 = 320.0;
const PANEL_HEIGHT: f64 = 480.0;

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
pub fn update_icon(
    app: &tauri::AppHandle,
    state: &str,
    tooltip: &str,
    title: &str,
) {
    let bytes = match state {
        "active" => icons::ACTIVE,
        "long" => icons::LONG,
        "offline" => icons::OFFLINE,
        _ => icons::IDLE,
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(img) = Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(img));
        }
        let _ = tray.set_tooltip(Some(tooltip));
        // set_title is a no-op outside macOS in tauri,
        // but we still gate it so the empty string
        // takes effect to clear stale text on macOS.
        #[cfg(target_os = "macos")]
        {
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
        }
    }
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
