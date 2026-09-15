/**
 * Profile-scoped localStorage helpers.
 *
 * Keys are prefixed with the active profile name so that
 * switching profiles isolates per-profile state (advisor
 * chat history, unread badges, view filters, etc.).
 *
 * The active profile comes from the server, and that is a
 * fetch, which means there is a window on every page load
 * where it is not yet known. These helpers are synchronous
 * and get called during render, so the window is real:
 * task cards read deadline acks while the request is still
 * in flight.
 *
 * What used to happen in that window was to assume
 * "default". Two things went wrong with that:
 *
 *   - A write landed under ``default:`` no matter which
 *     profile was active, so one profile's state leaked
 *     into another's namespace.
 *   - A read of a legacy unprefixed key MOVED it under
 *     ``default:`` and deleted the original. The profile
 *     it actually belonged to lost it for good.
 *
 * So: the resolved name is cached in localStorage and read
 * back synchronously on the next load, which closes the
 * window entirely except on the first load after a switch.
 * For that one, writes are buffered until the name
 * arrives, and the legacy migration waits too. A read in
 * the window can still return the previous profile's
 * value, which is wrong on screen for a few milliseconds
 * and, unlike the other two, undoes itself.
 */

/** Where the last known profile name is cached. Not
 *  prefixed: it is what tells us the prefix. */
const ACTIVE_KEY = "kaisho:activeProfile";

let _profile: string | null = null;
/** Writes made before the name was known. */
const pending = new Map<string, string | null>();

function readCached(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

_profile = readCached();

/** Apply the buffered writes now that the prefix is
 *  known, and run any migration that was held back. */
function flush(): void {
  for (const [key, value] of pending) {
    if (value === null) {
      localStorage.removeItem(prefix(key));
    } else {
      localStorage.setItem(prefix(key), value);
    }
  }
  pending.clear();
}

export function setActiveProfile(name: string): void {
  _profile = name || "default";
  try {
    localStorage.setItem(ACTIVE_KEY, _profile);
  } catch {
    // A full or disabled store is not worth failing over;
    // the fetch will resolve it again next load.
  }
  flush();
}

// Confirm (or correct) the cached name. Always runs, even
// when the cache was warm, so a profile switched in another
// window is picked up.
fetch("/api/settings/profiles")
  .then((r) => r.json())
  .then((data: { active: string }) => {
    setActiveProfile(data.active || "default");
  })
  .catch(() => {
    // Offline or the backend is not up yet. Keep whatever
    // the cache said; flush so buffered writes are not
    // lost, since "default" is the honest guess when there
    // is nothing better.
    if (_profile === null) _profile = "default";
    flush();
  });

function prefix(key: string): string {
  return `${_profile ?? "default"}:${key}`;
}

/**
 * Get a profile-scoped value from localStorage.
 *
 * A value written in this session but not yet flushed is
 * returned from the buffer, so a set/get pair inside the
 * window behaves the way a caller expects.
 */
export function profileGet(key: string): string | null {
  if (pending.has(key)) return pending.get(key) ?? null;

  const prefixed = localStorage.getItem(prefix(key));
  if (prefixed !== null) return prefixed;

  const old = localStorage.getItem(key);
  if (old === null) return null;
  // Read it, but only move it once the prefix is known.
  // Migrating under a guessed prefix deletes the original
  // and files it under the wrong profile.
  if (_profile !== null) {
    localStorage.setItem(prefix(key), old);
    localStorage.removeItem(key);
  }
  return old;
}

/** Set a profile-scoped value in localStorage. */
export function profileSet(
  key: string,
  value: string,
): void {
  if (_profile === null) {
    pending.set(key, value);
    return;
  }
  localStorage.setItem(prefix(key), value);
}

/** Remove a profile-scoped value from localStorage. */
export function profileRemove(key: string): void {
  if (_profile === null) {
    pending.set(key, null);
    return;
  }
  localStorage.removeItem(prefix(key));
}

/**
 * Get the current active profile name. Returns "default"
 * while it is still unknown, which is the right guess on a
 * first-ever load and the only one available.
 */
export function getActiveProfile(): string {
  return _profile ?? "default";
}
