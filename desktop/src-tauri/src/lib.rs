use std::sync::Mutex;

use tauri::{Manager, RunEvent, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Wraps the spawned `kai serve` child so we can kill it on
/// window close. Stored in Tauri's managed state.
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
        .setup(|app| {
            // Spawn `kai serve` from the user's PATH. We rely
            // on the shell plugin's Command which inherits the
            // login PATH on macOS when launched from Finder.
            let shell = app.shell();
            let (mut rx, child) = shell
                .command("kai")
                .args(["serve"])
                .spawn()?;

            app.manage(KaiProcess(Mutex::new(Some(child))));

            // Pipe child stdout/stderr to our own stdio for
            // debugging in `pnpm dev`.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text = String::from_utf8_lossy(
                                &line,
                            );
                            println!("[kai] {}", text);
                        }
                        CommandEvent::Stderr(line) => {
                            let text = String::from_utf8_lossy(
                                &line,
                            );
                            eprintln!("[kai] {}", text);
                        }
                        CommandEvent::Terminated(payload) => {
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
                let state: State<KaiProcess> = app_handle.state();
                kill_kai(&state);
            }
            RunEvent::ExitRequested { .. } => {
                let state: State<KaiProcess> = app_handle.state();
                kill_kai(&state);
            }
            RunEvent::Exit => {
                let state: State<KaiProcess> = app_handle.state();
                kill_kai(&state);
            }
            _ => {}
        });
}
