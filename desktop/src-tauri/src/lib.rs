use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, State, WindowEvent};
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
        .setup(|app| {
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
