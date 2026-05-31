/** Per-calendar colour assignment.
 *
 *  CalDAV servers may surface a colour via the
 *  Apple-namespaced ``calendar-color`` property; Google
 *  events do not carry per-event colours in the basic
 *  events.list response (would need a separate
 *  calendarList.list call). For both, fall back to a
 *  deterministic per-calendar-id palette so the same
 *  calendar always renders with the same colour without
 *  having to wire a settings panel for it.
 */

import type { CalendarEvent } from "../../api/client";

// Tile backgrounds use a low-alpha tint so they read on
// both light + dark surfaces; foreground text needs both
// a dark variant (900-weight on light) and a light variant
// (100-weight on dark) to stay AA-legible against the
// tinted tile + the page surface bleeding through.
const PALETTE = [
  { bg: "bg-blue-500/15",    bar: "bg-blue-500",
    text: "text-blue-900 dark:text-blue-100" },
  { bg: "bg-emerald-500/15", bar: "bg-emerald-500",
    text: "text-emerald-900 dark:text-emerald-100" },
  { bg: "bg-amber-500/15",   bar: "bg-amber-500",
    text: "text-amber-900 dark:text-amber-100" },
  { bg: "bg-rose-500/15",    bar: "bg-rose-500",
    text: "text-rose-900 dark:text-rose-100" },
  { bg: "bg-violet-500/15",  bar: "bg-violet-500",
    text: "text-violet-900 dark:text-violet-100" },
  { bg: "bg-cyan-500/15",    bar: "bg-cyan-500",
    text: "text-cyan-900 dark:text-cyan-100" },
  { bg: "bg-pink-500/15",    bar: "bg-pink-500",
    text: "text-pink-900 dark:text-pink-100" },
  { bg: "bg-indigo-500/15",  bar: "bg-indigo-500",
    text: "text-indigo-900 dark:text-indigo-100" },
];

export interface ColorClasses {
  bg: string;
  bar: string;
  text: string;
}

/** Stable string hash (FNV-1a) so the same calendar_id
 *  always picks the same palette entry. */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export function colorFor(event: CalendarEvent): ColorClasses {
  const key = `${event.source}:${event.calendar_id}`;
  return PALETTE[fnv1a(key) % PALETTE.length];
}
