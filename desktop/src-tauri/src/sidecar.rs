//! Sidecar process management.
//!
//! Spawns the `kai-server` Python backend as a child
//! process and pipes its stdout/stderr to the terminal.

use std::path::PathBuf;
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
        if let Ok(out) = crate::proc::configured(
            "lsof", "kill_stale.lsof",
        )
            .args(["-ti", &format!(":{}", SIDECAR_PORT)])
            .output()
        {
            let pids = String::from_utf8_lossy(&out.stdout);
            for pid in pids.split_whitespace() {
                eprintln!(
                    "[kai] killing stale process {}",
                    pid,
                );
                let _ = crate::proc::configured(
                    "kill", "kill_stale.kill",
                )
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
        // Find the single PID currently *listening* on
        // SIDECAR_PORT and taskkill it. The previous
        // implementation killed every PID that appeared
        // in any netstat line containing ``:8765`` — that
        // also matched ESTABLISHED and TIME_WAIT entries
        // for client-side connections from the webview,
        // so a normal shutdown would leave 20+ stale
        // socket entries and the next launch would spend
        // a full minute taskkilling unrelated PIDs
        // (including, on a bad day, kaisho-desktop itself
        // since the webview connects back to port 8765).
        //
        // The netstat layout is fixed-width-ish:
        //   Proto  Local Address  Foreign Address  State        PID
        //   TCP    127.0.0.1:8765 0.0.0.0:0        LISTENING    12345
        //
        // We want only the LISTENING row whose local
        // address ends with ``:SIDECAR_PORT``.
        //
        // Both ``netstat`` and ``taskkill`` are console-
        // subsystem CLIs; spawning them via ``proc::
        // configured`` applies ``CREATE_NO_WINDOW`` so we
        // don't flash a conhost window.
        let netstat = match crate::proc::configured(
            "netstat", "kill_stale.netstat",
        )
            .args(["-ano", "-p", "TCP"])
            .output()
        {
            Ok(o) => o,
            Err(_) => return,
        };
        let stdout = String::from_utf8_lossy(
            &netstat.stdout,
        );
        let suffix = format!(":{}", SIDECAR_PORT);
        let mut killed_any = false;
        for line in stdout.lines() {
            let cols: Vec<&str> =
                line.split_whitespace().collect();
            // Need at least: Proto Local Foreign State PID
            if cols.len() < 5 {
                continue;
            }
            if cols[3] != "LISTENING" {
                continue;
            }
            if !cols[1].ends_with(&suffix) {
                continue;
            }
            let pid = cols[4];
            eprintln!(
                "[kai] killing stale PID {} listening on \
                 port {}",
                pid, SIDECAR_PORT,
            );
            let _ = crate::proc::configured(
                "taskkill", "kill_stale.taskkill",
            )
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

/// Resolve the user's home directory across platforms.
/// `dirs` / `home` aren't dependencies; this keeps the crate
/// dependency-free for one tiny lookup.
fn home_dir() -> Option<PathBuf> {
    #[cfg(unix)]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
}

/// Delete extracted sidecar runtimes from older app versions.
///
/// The sidecar is a self-extracting PyInstaller bundle that
/// unpacks to ``~/.kaisho/runtime/<version>-<hash>/`` on
/// first launch. Each install is ~64 MB. The auto-updater
/// installs new versions but never cleaned up the old
/// extractions, so the directory grew unbounded
/// (1.8.x + 2.0.0 + 2.0.1 = ~192 MB after a single update).
///
/// Match by version prefix (``<current-version>-*``) so any
/// dir for an older version is pruned. Keeping all dirs for
/// the current version is intentional: dev rebuilds bump the
/// content hash but not the version, and the running binary
/// holds whichever is its own.
///
/// Errors are swallowed: a transient permissions issue or a
/// concurrent second instance holding the old runtime open
/// must not prevent the new sidecar from launching. The next
/// run picks up where this one left off.
fn prune_old_runtimes() {
    let Some(home) = home_dir() else { return };
    let runtime_dir = home.join(".kaisho").join("runtime");
    let entries = match std::fs::read_dir(&runtime_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let current_version = env!("CARGO_PKG_VERSION");
    let keep_prefix = format!("{}-", current_version);
    for entry in entries.flatten() {
        let path = entry.path();
        // Skip files (e.g. macOS .DS_Store) and the
        // current-version directory itself. The
        // version-hash format is "X.Y.Z-<hash>", so a
        // prefix match on "X.Y.Z-" cleanly keeps every
        // current-version extraction.
        let Ok(file_type) = entry.file_type() else { continue };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with(&keep_prefix) {
            continue;
        }
        eprintln!(
            "[kai] pruning stale sidecar runtime: {}",
            name_str,
        );
        // best-effort; if a concurrent process holds files
        // open on Windows the delete will fail and that's
        // fine -- next launch will retry.
        let _ = std::fs::remove_dir_all(&path);
    }
}

/// Spawn the `kai-server` sidecar and start piping
/// its output. Registers the child process as managed
/// state so it can be killed later.
pub fn spawn(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    kill_stale();
    prune_old_runtimes();
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
