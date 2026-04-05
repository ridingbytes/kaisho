/**
 * Lightweight mechanism to trigger an action in a panel when navigating
 * to it from the command palette. Panels register a callback; the palette
 * schedules an action that fires immediately if the panel is mounted, or
 * on the next mount if it isn't.
 */

type ActionFn = () => void;

const listeners = new Map<string, ActionFn>();
const pending = new Map<string, string>();

/** Call from command palette to request an action in a panel. */
export function schedulePanelAction(panel: string, action: string) {
  const fn = listeners.get(panel);
  if (fn && action === "open_form") {
    fn();
  } else {
    pending.set(panel, action);
  }
}

/**
 * Call from a panel component (in useEffect) to register its handler.
 * Returns a cleanup function to deregister.
 */
export function registerPanelAction(
  panel: string,
  handler: ActionFn
): () => void {
  listeners.set(panel, handler);
  // Consume any pending action that arrived before mount
  if (pending.get(panel) === "open_form") {
    pending.delete(panel);
    handler();
  }
  return () => {
    listeners.delete(panel);
  };
}
