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
use std::sync::OnceLock;
use std::time::Duration;

use tauri::{Manager, RunEvent, State, WindowEvent};
use tauri::Url;

use sidecar::KaiProcess;

// Release builds bind 8765 (production port). Debug
// builds (``tauri dev``) bind 8767 so a running
// installed Kaisho.app on 8765 does not collide with
// `bin/dev --desktop` and silently take over the port.
#[cfg(not(debug_assertions))]
const BACKEND_URL: &str = "http://127.0.0.1:8765";
#[cfg(not(debug_assertions))]
const BACKEND_ADDR: &str = "127.0.0.1:8765";

#[cfg(debug_assertions)]
const BACKEND_URL: &str = "http://127.0.0.1:8767";
#[cfg(debug_assertions)]
const BACKEND_ADDR: &str = "127.0.0.1:8767";

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

/// IPC command: true when this is a debug build
/// (``tauri dev``). The frontend uses it to skip the
/// auto-updater check, which would otherwise nag with
/// stale "update available" banners during development.
#[tauri::command]
fn is_dev_build() -> bool {
    cfg!(debug_assertions)
}

/// IPC command: kill the running kai-server sidecar so
/// the auto-updater can overwrite kai-server.exe on
/// Windows. Without this, NSIS pre-install hits an
/// "Error opening the file for writing" because the
/// sidecar still has the binary mapped. Safe to call on
/// macOS / Linux too — they don't lock running
/// executables for write but we still want a clean
/// shutdown before relaunch.
#[tauri::command]
fn kill_sidecar(state: State<KaiProcess>) {
    sidecar::kill(&state);
}

/// IPC command: open a file in the user's configured
/// external editor. ``command`` is a shell-style template
/// like ``alacritty -e nvim "{file}"``. The frontend has
/// already substituted ``{file}`` with the absolute path.
/// We split it into argv via ``shlex`` so quoted paths
/// survive spaces, and spawn the first token as a process.
#[tauri::command]
fn open_in_editor(command: String) -> Result<(), String> {
    let argv = shlex::split(&command).ok_or_else(|| {
        "could not parse editor command".to_string()
    })?;
    let mut iter = argv.into_iter();
    let bin = iter.next().ok_or_else(|| {
        "editor command is empty".to_string()
    })?;
    let args: Vec<String> = iter.collect();

    let mut cmd = std::process::Command::new(&bin);
    cmd.args(&args);
    if let Some(path) = shell_path() {
        cmd.env("PATH", path);
    }
    cmd.spawn().map_err(|e| {
        format!("failed to launch {}: {}", bin, e)
    })?;
    Ok(())
}

/// Cached PATH as seen by the user's interactive login
/// shell. GUI-launched apps inherit only the launchd
/// PATH (/usr/bin:/bin:/usr/sbin:/sbin) and miss anything
/// added by ~/.zshrc, ~/.bash_profile, etc., so bare-name
/// lookups for editors like ``alacritty`` fail. We resolve
/// the real PATH once at startup by spawning the login
/// shell and asking it to print ``$PATH``.
static SHELL_PATH: OnceLock<Option<String>> =
    OnceLock::new();

fn shell_path() -> Option<&'static str> {
    SHELL_PATH
        .get_or_init(detect_shell_path)
        .as_deref()
}

fn detect_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    // ``-l -i`` so the shell sources login + interactive
    // rc files (.zprofile, .zshrc, .bash_profile, etc.).
    // Redirect stderr to /dev/null to avoid noisy banners
    // from rc files polluting our captured value.
    let output = std::process::Command::new(&shell)
        .args(["-l", "-i", "-c", "printf %s \"$PATH\""])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8(output.stdout).ok()?;
    let path = path.trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
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
            is_dev_build,
            kill_sidecar,
            open_in_editor,
        ])
        .setup(|app| {
            // Warm the shell-PATH cache off the main
            // thread so the first editor launch doesn't
            // pay the shell-spawn latency.
            std::thread::spawn(|| {
                let _ = shell_path();
            });

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
