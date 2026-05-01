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

// Release builds run the sidecar on 8765, debug builds
// on 8767 (kept in sync with ``BACKEND_URL`` in lib.rs).
#[cfg(not(debug_assertions))]
const SIDECAR_PORT: &str = "8765";
#[cfg(debug_assertions)]
const SIDECAR_PORT: &str = "8767";

/// Kill any leftover kai-server process on the sidecar
/// port from a previous session (e.g. after auto-update).
fn kill_stale() {
    #[cfg(unix)]
    {
        use std::process::Command;
        if let Ok(out) = Command::new("lsof")
            .args(["-ti", &format!(":{}", SIDECAR_PORT)])
            .output()
        {
            let pids = String::from_utf8_lossy(&out.stdout);
            for pid in pids.split_whitespace() {
                eprintln!(
                    "[kai] killing stale process {}",
                    pid,
                );
                let _ = Command::new("kill")
                    .arg(pid.trim())
                    .output();
            }
            if !pids.trim().is_empty() {
                std::thread::sleep(
                    std::time::Duration::from_millis(500),
                );
            }
        }
    }

    #[cfg(windows)]
    {
        // Find PIDs bound to SIDECAR_PORT and taskkill
        // each one. ``taskkill /IM kai-server.exe`` would
        // also kill the user's installed Kaisho.app on
        // 8765, defeating the dev/release port split.
        use std::process::Command;
        let netstat = match Command::new("netstat")
            .args(["-ano", "-p", "TCP"])
            .output()
        {
            Ok(o) => o,
            Err(_) => return,
        };
        let stdout = String::from_utf8_lossy(
            &netstat.stdout,
        );
        let needle = format!(":{}", SIDECAR_PORT);
        let mut killed_any = false;
        for line in stdout.lines() {
            if !line.contains(&needle) {
                continue;
            }
            // netstat columns: Proto Local Foreign State PID
            let pid = match line.split_whitespace().last()
            {
                Some(p) => p,
                None => continue,
            };
            eprintln!(
                "[kai] killing stale PID {} on port {}",
                pid, SIDECAR_PORT,
            );
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", pid])
                .output();
            killed_any = true;
        }
        if killed_any {
            std::thread::sleep(
                std::time::Duration::from_millis(500),
            );
        }
    }
}

/// Spawn the `kai-server` sidecar and start piping
/// its output. Registers the child process as managed
/// state so it can be killed later.
pub fn spawn(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    kill_stale();
    let shell = app.shell();
    let (mut rx, child) = shell
        .sidecar("kai-server")
        .expect("kai-server sidecar not found")
        .env("SERVE_FRONTEND", "true")
        .args([
            "serve",
            "--host", "127.0.0.1",
            "--port", SIDECAR_PORT,
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
