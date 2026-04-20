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

// -----------------------------------------------------------
// Icon bytes (embedded at compile time)
// -----------------------------------------------------------

const ICON_IDLE: &[u8] =
    include_bytes!("../icons/tray-idle.png");
const ICON_ACTIVE: &[u8] =
    include_bytes!("../icons/tray-active.png");
const ICON_LONG: &[u8] =
    include_bytes!("../icons/tray-long.png");
const ICON_OFFLINE: &[u8] =
    include_bytes!("../icons/tray-offline.png");

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

    let icon = Image::from_bytes(ICON_IDLE)?;

    let handle_menu = handle.clone();
    let handle_click = handle.clone();

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
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

/// Switch the tray icon and tooltip text.
pub fn update_icon(
    app: &tauri::AppHandle,
    state: &str,
    tooltip: &str,
) {
    let bytes = match state {
        "active" => ICON_ACTIVE,
        "long" => ICON_LONG,
        "offline" => ICON_OFFLINE,
        _ => ICON_IDLE,
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(img) = Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(img));
        }
        let _ = tray.set_tooltip(Some(tooltip));
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

/// Place the panel below the tray icon click position.
/// Falls back to top-right corner of the primary
/// monitor if no position is provided.
fn position_panel(
    win: &tauri::WebviewWindow,
    position: Option<
        tauri::PhysicalPosition<f64>,
    >,
) {
    let sf = win.scale_factor().unwrap_or(2.0);
    let panel_w = PANEL_WIDTH * sf;

    if let Some(pos) = position {
        let x = (pos.x - panel_w / 2.0).max(0.0);
        let _ = win.set_position(
            tauri::Position::Physical(
                tauri::PhysicalPosition {
                    x: x as i32,
                    y: pos.y as i32,
                },
            ),
        );
        return;
    }

    // Fallback: top-right of primary monitor
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
