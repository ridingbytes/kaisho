/**
 * Per-profile persistence for collapsed kanban columns.
 *
 * Replaces the old single ``board_show_done`` flag. Now
 * every column can be collapsed independently and the
 * choice persists across reloads.
 *
 * Storage shape: a JSON array of task-state names (e.g.
 * ``["DONE", "CANCELLED"]``) under
 * ``board_collapsed_columns``. Profile-scoped via
 * ``profileGet`` / ``profileSet`` so switching profiles
 * gives each its own layout.
 *
 * A storage event-style custom event lets multiple
 * components reading the same state stay in sync without
 * a context provider — overkill for one consumer today,
 * but the board renders many columns and tomorrow the
 * dashboard may want the same.
 */
import { useCallback, useEffect, useState } from "react";

import {
  profileGet,
  profileSet,
} from "../utils/profileStorage";

const STORAGE_KEY = "board_collapsed_columns";
const CHANGE_EVENT = "collapsed-columns-change";

function load(): Set<string> {
  const raw = profileGet(STORAGE_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(
        parsed.filter(
          (item): item is string => typeof item === "string",
        ),
      );
    }
  } catch {
    // Corrupted value — fall through to a fresh set so
    // the board never crashes on malformed local data.
  }
  return new Set();
}

function persist(state: Set<string>): void {
  profileSet(
    STORAGE_KEY, JSON.stringify(Array.from(state)),
  );
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useCollapsedColumns(): {
  isCollapsed: (name: string) => boolean;
  toggle: (name: string) => void;
} {
  const [state, setState] = useState<Set<string>>(load);

  useEffect(() => {
    function onChange() {
      setState(load());
    }
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  const isCollapsed = useCallback(
    (name: string) => state.has(name),
    [state],
  );

  const toggle = useCallback((name: string) => {
    const next = new Set(state);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    persist(next);
    setState(next);
  }, [state]);

  return { isCollapsed, toggle };
}
