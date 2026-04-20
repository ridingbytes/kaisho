//! Sidecar process management.
//!
//! Spawns the `kai-server` Python backend as a child
//! process and pipes its stdout/stderr to the terminal.

use std::sync::Mutex;

use tauri::{Manager, State};
use tauri_plugin_shell::process::{
    CommandChild, CommandEvent,
};
use tauri_plugin_shell::ShellExt;

/// Holds the sidecar child process so it can be killed
/// on app exit.
pub struct KaiProcess(Mutex<Option<CommandChild>>);

/// Kill the sidecar process if it is still running.
pub fn kill(state: &State<'_, KaiProcess>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
}

/// Spawn the `kai-server` sidecar and start piping
/// its output. Registers the child process as managed
/// state so it can be killed later.
pub fn spawn(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shell = app.shell();
    let (mut rx, child) = shell
        .sidecar("kai-server")
        .expect("kai-server sidecar not found")
        .env("SERVE_FRONTEND", "true")
        .args([
            "serve",
            "--host", "127.0.0.1",
            "--port", "8765",
        ])
        .spawn()?;

    app.manage(KaiProcess(Mutex::new(Some(child))));

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!(
                        "[kai] {}",
                        String::from_utf8_lossy(&line),
                    );
                }
                CommandEvent::Stderr(line) => {
                    eprintln!(
                        "[kai] {}",
                        String::from_utf8_lossy(&line),
                    );
                }
                CommandEvent::Terminated(p) => {
                    eprintln!(
                        "[kai] exited: {:?}", p,
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
