//! Cross-platform helpers around ``std::process::Command``.
//!
//! On Windows, ``std::process::Command::spawn`` /
//! ``.output()`` do not set ``CREATE_NO_WINDOW``. Any child
//! that is a console-subsystem app (``netstat``, ``taskkill``,
//! ``sh``, ``cmd``, ...) flashes a conhost window for the
//! lifetime of the call.
//!
//! Use ``configured(...)`` to get a ``Command`` with the right
//! defaults applied: ``CREATE_NO_WINDOW`` on Windows, plus
//! optional spawn tracing into
//! ``<KAISHO_HOME or ~/.kaisho>/subproc-trace.log`` when
//! ``KAISHO_TRACE_SUBPROC=1`` is set. Mirrors the Python-side
//! ``kaisho.subproc`` so a single log captures both halves.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Build a ``Command`` with the platform-appropriate window
/// suppression applied. ``label`` is recorded in the spawn
/// trace so we can tell which call site produced it.
pub fn configured(bin: &str, label: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    trace_spawn(bin, label);
    cmd
}

fn trace_enabled() -> bool {
    std::env::var_os("KAISHO_TRACE_SUBPROC").is_some()
}

fn trace_path() -> Option<PathBuf> {
    let base = if let Some(home) =
        std::env::var_os("KAISHO_HOME")
    {
        PathBuf::from(home)
    } else {
        #[cfg(windows)]
        let h = std::env::var_os("USERPROFILE")?;
        #[cfg(unix)]
        let h = std::env::var_os("HOME")?;
        PathBuf::from(h).join(".kaisho")
    };
    std::fs::create_dir_all(&base).ok()?;
    Some(base.join("subproc-trace.log"))
}

fn trace_spawn(bin: &str, label: &str) {
    if !trace_enabled() {
        return;
    }
    let Some(path) = trace_path() else { return };
    let ts = chrono_like_now();
    let line = format!(
        "[{ts}] rust spawn bin={bin:?} label={label}\n",
    );
    let _ = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut f| f.write_all(line.as_bytes()));
}

/// Cheap ISO-ish timestamp without pulling in ``chrono``.
fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // unix epoch seconds keeps the line greppable and avoids
    // a dependency just for "now". The Python side writes
    // wall-clock ISO; correlating the two is a sort + diff.
    format!("ts={now}")
}
