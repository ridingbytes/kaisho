import { useCallback, useState } from "react";

/**
 * Manage inline edit/save/cancel state.
 *
 * Usage:
 *   const edit = useEditMode({
 *     desc: entry.description,
 *     hours: String(entry.duration_minutes / 60),
 *   });
 *
 *   if (edit.editing) {
 *     // render inputs bound to edit.draft
 *     // call edit.setField("desc", newVal)
 *     // call edit.save() or edit.cancel()
 *   } else {
 *     // render read-only view
 *     // call edit.start() to enter edit mode
 *   }
 */

/** Props returned by the useEditMode hook. */
export interface EditMode<T extends Record<string, unknown>> {
  /** Whether the edit form is currently visible. */
  editing: boolean;
  /** The mutable draft values being edited. */
  draft: T;
  /** Enter edit mode with fresh draft values. */
  start: (initial?: Partial<T>) => void;
  /** Exit edit mode without saving. */
  cancel: () => void;
  /** Update a single field in the draft. */
  setField: <K extends keyof T>(
    key: K, value: T[K],
  ) => void;
  /** True if any draft field differs from defaults. */
  isDirty: boolean;
}

/**
 * Hook for inline editing with draft state.
 *
 * @param defaults - Initial values for the draft fields.
 *   When start() is called without arguments, these are
 *   used. Pass updated defaults to reflect the latest
 *   data from the server.
 */
export function useEditMode<
  T extends Record<string, unknown>,
>(defaults: T): EditMode<T> {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(defaults);

  const start = useCallback(
    (initial?: Partial<T>) => {
      setDraft({ ...defaults, ...initial });
      setEditing(true);
    },
    [defaults],
  );

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const isDirty = Object.keys(defaults).some(
    (k) => draft[k] !== defaults[k],
  );

  return {
    editing, draft, start, cancel, setField, isDirty,
  };
}
