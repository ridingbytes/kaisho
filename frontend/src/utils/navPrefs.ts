/** Sidebar visibility preferences persisted in
 * localStorage. Kept here as a tiny module rather than a
 * React context so non-component code (e.g. utility hooks
 * elsewhere) can read the same flag. The Sidebar
 * subscribes to the ``nav-prefs-changed`` window event to
 * react to changes without polling.
 */

const HIDE_GITHUB_KEY = "kaisho_hide_github_nav";

export function isGithubNavHidden(): boolean {
  return localStorage.getItem(HIDE_GITHUB_KEY) === "1";
}

export function setGithubNavHidden(hidden: boolean): void {
  if (hidden) {
    localStorage.setItem(HIDE_GITHUB_KEY, "1");
  } else {
    localStorage.removeItem(HIDE_GITHUB_KEY);
  }
  window.dispatchEvent(new Event("nav-prefs-changed"));
}
