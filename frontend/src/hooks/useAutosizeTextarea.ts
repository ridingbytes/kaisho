/**
 * Make a textarea grow with its content (ChatGPT-style).
 *
 * Resets ``height`` to ``auto`` and then assigns
 * ``scrollHeight`` so the box always fits the current
 * value. Caps at ``maxHeight``; once that's hit the
 * textarea becomes scrollable instead of pushing the
 * surrounding layout further down.
 *
 * Usage:
 *   const ref = useRef<HTMLTextAreaElement>(null);
 *   useAutosizeTextarea(ref, value);
 *   <textarea ref={ref} rows={1} ... />
 */
import { RefObject, useEffect } from "react";

export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement>,
  value: string,
  maxHeight = 200,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // For an empty textarea ``scrollHeight`` can read
    // near-zero before layout settles, which would
    // collapse the input to ~1px. Fall back to the
    // ``rows`` attribute's natural height in that case.
    if (!value) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY =
      el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, value, maxHeight]);
}
