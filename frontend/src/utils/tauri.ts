/** Check if the app is running inside a Tauri webview. */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/**
 * Open a URL in the system browser.
 *
 * In Tauri, uses the shell plugin to open the URL
 * externally. In the browser, falls back to
 * window.open().
 */
export async function openExternal(
  url: string,
): Promise<void> {
  if (isTauri()) {
    try {
      const { open } = await import(
        "@tauri-apps/plugin-shell"
      );
      await open(url);
      return;
    } catch (err) {
      // Log so silent permission failures surface in
      // devtools. ``plugins.shell.open`` must be set in
      // ``tauri.conf.json`` (regex or ``true``) -- without
      // it Tauri 2 rejects every URL.
      console.warn(
        "[openExternal] tauri shell.open failed,"
        + " falling back to window.open:",
        err,
      );
    }
  }
  window.open(url, "_blank", "noreferrer");
}
