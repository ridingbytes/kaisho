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
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank", "noreferrer");
}
