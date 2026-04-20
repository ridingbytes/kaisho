use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{
    Emitter, Manager, RunEvent, State, WindowEvent,
};
use tauri::Url;
use tauri_plugin_shell::process::{
    CommandChild, CommandEvent,
};
use tauri_plugin_shell::ShellExt;

struct KaiProcess(Mutex<Option<CommandChild>>);

fn kill_kai(state: &State<'_, KaiProcess>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
}

const BACKEND_URL: &str = "http://127.0.0.1:8765";

fn is_port_open() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:8765".parse().unwrap(),
        Duration::from_millis(200),
    )
    .is_ok()
}

async fn wait_and_navigate(handle: tauri::AppHandle) {
    for _ in 0..120 {
        tokio::time::sleep(
            Duration::from_millis(500),
        )
        .await;

        if is_port_open() {
            tokio::time::sleep(
                Duration::from_millis(500),
            )
            .await;

            if let Some(win) =
                handle.get_webview_window("main")
            {
                let url = Url::parse(BACKEND_URL)
                    .expect("invalid URL");
                let _ = win.navigate(url);
            }
            // Navigate the tray window to the backend
            // so tray.html is served correctly
            if let Some(win) =
                handle.get_webview_window("tray")
            {
                let url = Url::parse(
                    &format!(
                        "{}/tray.html", BACKEND_URL,
                    ),
                )
                .expect("invalid tray URL");
                let _ = win.navigate(url);
            }
            return;
        }
    }

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

/// Toggle the tray popover window visibility and
/// position it below the tray icon.
fn toggle_tray_window(
    app: &tauri::AppHandle,
    position: Option<tauri::PhysicalPosition<f64>>,
) {
    if let Some(win) =
        app.get_webview_window("tray")
    {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            return;
        }

        let sf = win.scale_factor().unwrap_or(2.0);
        let win_w = 320.0 * sf;

        if let Some(pos) = position {
            // Center the panel horizontally under
            // the tray icon click position
            let x = pos.x - win_w / 2.0;
            let _ = win.set_position(
                tauri::Position::Physical(
                    tauri::PhysicalPosition {
                        x: x.max(0.0) as i32,
                        y: pos.y as i32,
                    },
                ),
            );
        } else if let Some(m) = win.primary_monitor()
            .ok().flatten()
        {
            let s = m.size();
            let x = s.width as i32
                - win_w as i32 - 20;
            let _ = win.set_position(
                tauri::Position::Physical(
                    tauri::PhysicalPosition {
                        x: x.max(0),
                        y: (30.0 * sf) as i32,
                    },
                ),
            );
        }

        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// IPC command: update the tray icon based on timer
/// state. Called from the tray panel JS after each
/// poll cycle.
#[tauri::command]
fn update_tray_icon(
    app: tauri::AppHandle,
    state: String,
    tooltip: String,
) {
    let icon_path = match state.as_str() {
        "active" => {
            include_bytes!("../icons/tray-active.png")
                .as_slice()
        }
        "long" => {
            include_bytes!("../icons/tray-long.png")
                .as_slice()
        }
        "offline" => {
            include_bytes!("../icons/tray-offline.png")
                .as_slice()
        }
        _ => {
            include_bytes!("../icons/tray-idle.png")
                .as_slice()
        }
    };

    if let Some(tray) = app.tray_by_id("kaisho-tray") {
        if let Ok(img) = Image::from_bytes(icon_path) {
            let _ = tray.set_icon(Some(img));
        }
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// IPC command: hide the tray popover window.
#[tauri::command]
fn hide_tray_window(app: tauri::AppHandle) {
    if let Some(win) =
        app.get_webview_window("tray")
    {
        let _ = win.hide();
    }
}

/// IPC command: show (focus) the main window.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(win) =
        app.get_webview_window("main")
    {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// IPC command: toggle the timer (start or stop).
/// Calls the backend API directly and notifies the
/// tray panel to refresh.
#[tauri::command]
fn toggle_timer(app: tauri::AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        let active = http_get("/api/clocks/active");
        match active {
            Ok(body)
                if body.contains("\"active\":true") =>
            {
                let _ = http_post(
                    "/api/clocks/stop", "{}",
                );
            }
            Ok(_) => {
                // No timer — show tray panel so the
                // user can pick a customer
                if let Some(win) =
                    handle.get_webview_window("tray")
                {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            Err(_) => {} // backend offline
        }
        let _ = handle.emit("timer-changed", "");
    });
}

/// HTTP GET to the local backend. Returns the
/// response body.
fn http_get(path: &str) -> Result<String, String> {
    use std::io::Read;
    let addr = "127.0.0.1:8765";
    let mut s = TcpStream::connect(addr)
        .map_err(|e| format!("{e}"))?;
    let req = format!(
        "GET {path} HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         Connection: close\r\n\r\n",
    );
    std::io::Write::write_all(
        &mut s, req.as_bytes(),
    )
    .map_err(|e| format!("{e}"))?;
    let mut buf = String::new();
    s.read_to_string(&mut buf)
        .map_err(|e| format!("{e}"))?;
    match buf.find("\r\n\r\n") {
        Some(i) => Ok(buf[i + 4..].to_string()),
        None => Ok(buf),
    }
}

/// HTTP POST JSON to the local backend.
fn http_post(
    path: &str, body: &str,
) -> Result<String, String> {
    use std::io::Read;
    let addr = "127.0.0.1:8765";
    let mut s = TcpStream::connect(addr)
        .map_err(|e| format!("{e}"))?;
    let req = format!(
        "POST {path} HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n{body}",
        body.len(),
    );
    std::io::Write::write_all(
        &mut s, req.as_bytes(),
    )
    .map_err(|e| format!("{e}"))?;
    let mut buf = String::new();
    s.read_to_string(&mut buf)
        .map_err(|e| format!("{e}"))?;
    match buf.find("\r\n\r\n") {
        Some(i) => Ok(buf[i + 4..].to_string()),
        None => Ok(buf),
    }
}

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
        ])
        .setup(|app| {
            // -- Sidecar ---------------------------------
            let shell = app.shell();
            let (mut rx, child) = shell
                .sidecar("kai-server")
                .expect(
                    "kai-server sidecar not found",
                )
                .env("SERVE_FRONTEND", "true")
                .args([
                    "serve",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8765",
                ])
                .spawn()?;

            app.manage(KaiProcess(Mutex::new(
                Some(child),
            )));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(
                wait_and_navigate(handle),
            );

            tauri::async_runtime::spawn(async move {
                while let Some(event) =
                    rx.recv().await
                {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!(
                                "[kai] {}",
                                String::from_utf8_lossy(
                                    &line,
                                ),
                            );
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!(
                                "[kai] {}",
                                String::from_utf8_lossy(
                                    &line,
                                ),
                            );
                        }
                        CommandEvent::Terminated(p) => {
                            eprintln!(
                                "[kai] exited: {:?}",
                                p,
                            );
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // -- System tray -----------------------------
            let handle = app.handle().clone();

            let open_i = MenuItemBuilder::with_id(
                "open", "Open Kaisho",
            )
            .build(app)?;
            let toggle_i = MenuItemBuilder::with_id(
                "toggle_timer", "Start / Stop Timer",
            )
            .build(app)?;
            let quit_i = MenuItemBuilder::with_id(
                "quit", "Quit",
            )
            .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&open_i)
                .item(&toggle_i)
                .separator()
                .item(&quit_i)
                .build()?;

            let icon = Image::from_bytes(
                include_bytes!("../icons/tray-idle.png"),
            )?;

            let handle_menu = handle.clone();
            let handle_click = handle.clone();

            TrayIconBuilder::with_id("kaisho-tray")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Kaisho — no active timer")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |_app, event| {
                    match event.id().as_ref() {
                        "open" => {
                            show_main_window(
                                handle_menu.clone(),
                            );
                        }
                        "toggle_timer" => {
                            toggle_timer(
                                handle_menu.clone(),
                            );
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(
                    move |_tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            position,
                            ..
                        } = event
                        {
                            toggle_tray_window(
                                &handle_click,
                                Some(position),
                            );
                        }
                    },
                )
                .build(app)?;

            // -- Global shortcuts ------------------------
            use tauri_plugin_global_shortcut::{
                GlobalShortcutExt, Shortcut,
            };

            let handle_sc = app.handle().clone();

            // Cmd+Shift+T — toggle tray popover
            if let Ok(sc) =
                "CommandOrControl+Shift+T".parse::<Shortcut>()
            {
                let h = handle_sc.clone();
                let _ = app.global_shortcut().on_shortcut(
                    sc,
                    move |_app, _sc, _ev| {
                        toggle_tray_window(&h, None);
                    },
                );
            }

            // Cmd+Shift+S — start/stop timer
            if let Ok(sc) =
                "CommandOrControl+Shift+S".parse::<Shortcut>()
            {
                let h = handle_sc.clone();
                let _ = app.global_shortcut().on_shortcut(
                    sc,
                    move |_app, _sc, _ev| {
                        toggle_timer(h.clone());
                    },
                );
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kaisho")
        .run(|app_handle, event| match event {
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested {
                    api, ..
                },
                ..
            } => {
                // When closing the main window, hide
                // it instead of quitting — the tray
                // stays active.
                if label == "main" {
                    api.prevent_close();
                    if let Some(win) =
                        app_handle
                            .get_webview_window("main")
                    {
                        let _ = win.hide();
                    }
                }
                // Tray window: just hide
                if label == "tray" {
                    api.prevent_close();
                    if let Some(win) =
                        app_handle
                            .get_webview_window("tray")
                    {
                        let _ = win.hide();
                    }
                }
            }
            RunEvent::WindowEvent {
                event: WindowEvent::Destroyed,
                ..
            } => {
                let state: State<KaiProcess> =
                    app_handle.state();
                kill_kai(&state);
            }
            RunEvent::ExitRequested { api, .. } => {
                // Keep running when all windows are
                // closed — the tray should stay alive.
                api.prevent_exit();
            }
            RunEvent::Exit => {
                let state: State<KaiProcess> =
                    app_handle.state();
                kill_kai(&state);
            }
            _ => {}
        });
}
