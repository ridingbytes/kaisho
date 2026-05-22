// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// macOS dev binaries have no .app bundle, so the OS
// doesn't know the bundle identifier and silently rejects
// NSStatusItem (tray icon). Embedding Info.plist directly
// into the Mach-O __TEXT,__info_plist section gives the
// bare binary a real identity. Only needed for debug
// builds; release builds get their plist from the bundler.
#[cfg(all(debug_assertions, target_os = "macos"))]
embed_plist::embed_info_plist!("../Info.dev.plist");

fn main() {
    kaisho_desktop::run()
}
