use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

const BACKEND_PORT: u16 = 8765;
const BACKEND_URL: &str = "http://localhost:8765";

/// Wait until the backend is responding on its port.
async fn wait_for_backend() -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    for _ in 0..30 {
        if client.get(BACKEND_URL).send().await.is_ok() {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(format!(
        "Backend did not start on port {} within 15 seconds",
        BACKEND_PORT,
    ))
}

/// Navigate the main window to the backend URL.
/// Uses Tauri's webview eval to set window.location.
/// This is safe: the URL is a hardcoded localhost constant,
/// not user input.
fn navigate_to_backend(
    handle: &tauri::AppHandle,
) -> Result<(), String> {
    if let Some(window) = handle.get_webview_window("main") {
        // Tauri's WebviewWindow::eval runs JS in the webview.
        // We use it here solely to redirect to the sidecar URL.
        let script = format!(
            "window.location.replace(\"{}\")",
            BACKEND_URL,
        );
        window.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Spawn the Python backend as a sidecar process.
            // The binary is bundled via externalBin in
            // tauri.conf.json and named "kai-server".
            let shell = app.shell();
            let sidecar = shell
                .sidecar("kai-server")
                .map_err(|e| e.to_string())?
                .args(["serve", "--host", "127.0.0.1"])
                .spawn()
                .map_err(|e| e.to_string())?;

            // Store the sidecar child so we can kill it on
            // exit. The drop impl sends SIGTERM.
            app.manage(sidecar);

            // Wait for backend readiness in a background task,
            // then redirect the webview to the backend URL.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match wait_for_backend().await {
                    Ok(()) => {
                        let _ = navigate_to_backend(&handle);
                    }
                    Err(e) => {
                        eprintln!("Sidecar error: {}", e);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Kaisho");
}
