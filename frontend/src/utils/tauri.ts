/** Check if the app is running inside a Tauri webview. */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/**
 * Tauri updater download-progress events.
 *
 * The `@tauri-apps/plugin-updater` doesn't ship a
 * typed callback for `downloadAndInstall`, so callers
 * used to retype the parameter as `any` (with an
 * eslint-disable). This is the shared declaration used
 * by `App.tsx` and `settings/UpdateTab.tsx`. The exact
 * payload shape follows the plugin's TS types as of
 * v2.x; if those drift the failure shows up as a
 * compile-time mismatch instead of a runtime undefined.
 */
export type DownloadProgressEvent =
  | { event: "Started"; data?: { contentLength?: number } }
  | { event: "Progress"; data?: { chunkLength?: number } }
  | { event: "Finished" };

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
