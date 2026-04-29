//! Kaisho desktop shell.
//!
//! Manages the sidecar backend process, the system tray
//! icon, and the tray popover panel. The main window
//! navigates to the backend at `localhost:8765` once it
//! is ready.

mod sidecar;
mod tray;
mod http;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{Manager, RunEvent, State, WindowEvent};
use tauri::Url;

use sidecar::KaiProcess;

const BACKEND_URL: &str = "http://127.0.0.1:8765";
const BACKEND_ADDR: &str = "127.0.0.1:8765";

/// Whether the app should keep running in the tray
/// when the main window is closed. Toggled from the
/// frontend via the `set_tray_enabled` IPC command.
/// Defaults to true on macOS, false on Windows/Linux.
static TRAY_ENABLED: AtomicBool = AtomicBool::new(
    cfg!(target_os = "macos"),
);

// -----------------------------------------------------------
// Startup: wait for backend, then navigate windows
// -----------------------------------------------------------

/// Poll the backend port until it responds, then
/// navigate the main and tray windows to the backend.
async fn wait_and_navigate(handle: tauri::AppHandle) {
    for _ in 0..120 {
        tokio::time::sleep(Duration::from_millis(500))
            .await;

        if http::is_port_open() {
            tokio::time::sleep(
                Duration::from_millis(500),
            )
            .await;
            navigate_window(
                &handle, "main", BACKEND_URL,
            );
            navigate_window(
                &handle,
                "tray",
                &format!("{}/tray.html", BACKEND_URL),
            );
            return;
        }
    }

    // Backend did not start within 60 seconds
    if let Some(win) =
        handle.get_webview_window("main")
    {
        let _ = win.eval(
            "document.getElementById('status')\
             .textContent = \
             'Backend did not start.'",
        );
    }
}

fn navigate_window(
    handle: &tauri::AppHandle,
    label: &str,
    url: &str,
) {
    if let Some(win) =
        handle.get_webview_window(label)
    {
        if let Ok(u) = Url::parse(url) {
            let _ = win.navigate(u);
        }
    }
}

// -----------------------------------------------------------
// IPC commands (called from frontend JS)
// -----------------------------------------------------------

/// Update the tray icon to reflect the timer state.
/// Called by the tray panel JS every 5 seconds (state)
/// and every minute (title).
///
/// ``title`` shows next to the icon in the macOS menu
/// bar (typically the elapsed ``HH:MM``); pass an empty
/// string to clear it. Windows / Linux ignore titles —
/// the Rust helper short-circuits on those platforms.
#[tauri::command]
fn update_tray_icon(
    app: tauri::AppHandle,
    state: String,
    tooltip: String,
    title: Option<String>,
) {
    tray::update_icon(
        &app,
        &state,
        &tooltip,
        title.as_deref().unwrap_or(""),
    );
}

/// Hide the tray popover panel.
#[tauri::command]
fn hide_tray_window(app: tauri::AppHandle) {
    if let Some(win) =
        app.get_webview_window("tray")
    {
        let _ = win.hide();
    }
}

/// Show and focus the main application window.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(win) =
        app.get_webview_window("main")
    {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// IPC command: check if tray mode is enabled.
#[tauri::command]
fn get_tray_enabled() -> bool {
    TRAY_ENABLED.load(Ordering::Relaxed)
}

/// IPC command: enable or disable tray mode.
#[tauri::command]
fn set_tray_enabled(enabled: bool) {
    TRAY_ENABLED.store(enabled, Ordering::Relaxed);
}

/// Toggle the running timer via the backend API.
/// If a timer is running, stop it. Otherwise open the
/// tray panel so the user can pick a customer.
#[tauri::command]
fn toggle_timer(app: tauri::AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        match http::get("/api/clocks/active") {
            Ok(body)
                if body.contains("\"active\":true") =>
            {
                let _ = http::post(
                    "/api/clocks/stop", "{}",
                );
            }
            Ok(_) => {
                // No timer running — show the tray
                // panel so the user can start one
                if let Some(win) =
                    handle.get_webview_window("tray")
                {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            Err(_) => {} // backend offline
        }
        let _ = tauri::Emitter::emit(
            &handle, "timer-changed", "",
        );
    });
}

// -----------------------------------------------------------
// Application entry point
// -----------------------------------------------------------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_updater::Builder::new()
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            update_tray_icon,
            hide_tray_window,
            show_main_window,
            toggle_timer,
            get_tray_enabled,
            set_tray_enabled,
        ])
        .setup(|app| {
            sidecar::spawn(app)?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(
                wait_and_navigate(handle),
            );

            tray::setup(app)?;
            register_shortcuts(app);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kaisho")
        .run(handle_run_event);
}

// -----------------------------------------------------------
// Global keyboard shortcuts
// -----------------------------------------------------------

fn register_shortcuts(app: &tauri::App) {
    use tauri_plugin_global_shortcut::{
        GlobalShortcutExt, Shortcut,
    };

    let handle = app.handle().clone();

    // Cmd+Shift+T — toggle tray popover
    if let Ok(sc) = "CommandOrControl+Shift+T"
        .parse::<Shortcut>()
    {
        let h = handle.clone();
        let _ = app.global_shortcut().on_shortcut(
            sc,
            move |_app, _sc, _ev| {
                tray::toggle_window(&h, None);
            },
        );
    }

    // Cmd+Shift+S — start/stop timer
    if let Ok(sc) = "CommandOrControl+Shift+S"
        .parse::<Shortcut>()
    {
        let h = handle.clone();
        let _ = app.global_shortcut().on_shortcut(
            sc,
            move |_app, _sc, _ev| {
                toggle_timer(h.clone());
            },
        );
    }
}

// -----------------------------------------------------------
// Run-event handler (window close, exit)
// -----------------------------------------------------------

fn handle_run_event(
    app_handle: &tauri::AppHandle,
    event: RunEvent,
) {
    match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested {
                api, ..
            },
            ..
        } => {
            if label == "tray" {
                // Always hide tray panel, never quit
                api.prevent_close();
                if let Some(win) =
                    app_handle.get_webview_window("tray")
                {
                    let _ = win.hide();
                }
            } else if TRAY_ENABLED.load(Ordering::Relaxed)
            {
                // Tray mode: hide main window instead
                // of quitting
                api.prevent_close();
                if let Some(win) =
                    app_handle.get_webview_window(&label)
                {
                    let _ = win.hide();
                }
            } else {
                // No tray mode: quit the app
                let state: State<KaiProcess> =
                    app_handle.state();
                sidecar::kill(&state);
                std::process::exit(0);
            }
        }
        RunEvent::WindowEvent {
            event: WindowEvent::Destroyed, ..
        } => {
            let state: State<KaiProcess> =
                app_handle.state();
            sidecar::kill(&state);
        }
        RunEvent::ExitRequested { api, .. } => {
            // Keep running when all windows close —
            // the tray should remain active.
            api.prevent_exit();
        }
        RunEvent::Exit => {
            let state: State<KaiProcess> =
                app_handle.state();
            sidecar::kill(&state);
        }
        _ => {}
    }
}
