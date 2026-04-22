/**
 * Profile-scoped localStorage helpers.
 *
 * Keys are prefixed with the active profile name so that
 * switching profiles isolates per-profile state (advisor
 * chat history, unread badges, view filters, etc.).
 *
 * The active profile is fetched once on module load and
 * cached. Since the page reloads on every profile switch,
 * this is always current.
 */

let _profile = "default";

// Fetch the active profile name eagerly on module load.
// Falls back to "default" if the fetch fails.
fetch("/api/settings/profiles")
  .then((r) => r.json())
  .then((data: { active: string }) => {
    _profile = data.active || "default";
  })
  .catch(() => {});

function prefix(key: string): string {
  return `${_profile}:${key}`;
}

/**
 * Get a profile-scoped value from localStorage.
 *
 * Before the profile is loaded, falls back to the
 * unprefixed key for backwards compatibility (first
 * page load before the fetch completes).
 */
export function profileGet(key: string): string | null {
  const prefixed = localStorage.getItem(prefix(key));
  if (prefixed !== null) return prefixed;
  // Backwards compat: migrate old unprefixed value
  const old = localStorage.getItem(key);
  if (old !== null) {
    localStorage.setItem(prefix(key), old);
    localStorage.removeItem(key);
    return old;
  }
  return null;
}

/** Set a profile-scoped value in localStorage. */
export function profileSet(
  key: string,
  value: string,
): void {
  localStorage.setItem(prefix(key), value);
}

/** Remove a profile-scoped value from localStorage. */
export function profileRemove(key: string): void {
  localStorage.removeItem(prefix(key));
}

/**
 * Get the current active profile name.
 * Returns "default" before the initial fetch completes.
 */
export function getActiveProfile(): string {
  return _profile;
}
