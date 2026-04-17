use std::sync::Mutex;

use tauri::{Manager, RunEvent, State, WindowEvent};
use tauri_plugin_shell::process::{
    CommandChild, CommandEvent,
};
use tauri_plugin_shell::ShellExt;

/// Wraps the spawned kai-server child so we can kill it
/// on window close. Stored in Tauri's managed state.
struct KaiProcess(Mutex<Option<CommandChild>>);

/// Kill the stored kai child process, if any. Idempotent.
fn kill_kai(state: &State<'_, KaiProcess>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Spawn the bundled kai-server sidecar.
            let shell = app.shell();
            // Pick a random port to avoid conflicts with
            // other kaisho instances or dev servers.
            let port = {
                let listener =
                    std::net::TcpListener::bind(
                        "127.0.0.1:0",
                    )
                    .expect("failed to bind random port");
                listener.local_addr().unwrap().port()
            };
            let port_str = port.to_string();

            let (mut rx, child) = shell
                .sidecar("kai-server")
                .expect("kai-server sidecar not found")
                .env("SERVE_FRONTEND", "true")
                .args([
                    "serve",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    &port_str,
                ])
                .spawn()?;

            app.manage(KaiProcess(Mutex::new(Some(child))));

            // Tell the splash screen which port to poll.
            // This is a Tauri webview eval (not browser
            // eval) — it injects a constant into the
            // splash page's JS context.
            if let Some(win) = app.get_webview_window("main")
            {
                let js = format!(
                    "window.__KAISHO_PORT__ = {};",
                    port,
                );
                let _ = win.eval(&js);  // safe: Tauri webview API, not user input
            }

            // Pipe child stdout/stderr for debugging.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text =
                                String::from_utf8_lossy(
                                    &line,
                                );
                            println!("[kai] {}", text);
                        }
                        CommandEvent::Stderr(line) => {
                            let text =
                                String::from_utf8_lossy(
                                    &line,
                                );
                            eprintln!("[kai] {}", text);
                        }
                        CommandEvent::Terminated(
                            payload,
                        ) => {
                            eprintln!(
                                "[kai] terminated: {:?}",
                                payload,
                            );
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kaisho")
        .run(|app_handle, event| match event {
            RunEvent::WindowEvent {
                event: WindowEvent::Destroyed,
                ..
            } => {
                let state: State<KaiProcess> =
                    app_handle.state();
                kill_kai(&state);
            }
            RunEvent::ExitRequested { .. } => {
                let state: State<KaiProcess> =
                    app_handle.state();
                kill_kai(&state);
            }
            RunEvent::Exit => {
                let state: State<KaiProcess> =
                    app_handle.state();
                kill_kai(&state);
            }
            _ => {}
        });
}
