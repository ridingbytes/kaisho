/**
 * Shared formatting utilities for durations, dates,
 * and times. Replaces per-component duplicates.
 */
import i18n from "../i18n";

/** Format minutes as "Xh" or "X.Xh" (e.g. "2.5h"). */
export function formatHours(
  minutes: number | null,
): string {
  if (minutes === null) return "—";
  const h = (minutes / 60)
    .toFixed(2)
    .replace(/\.?0+$/, "");
  return `${h}h`;
}

/** Format minutes as decimal string (e.g. "2.5"). */
export function minutesToDecimal(
  minutes: number | null,
): string {
  if (minutes === null) return "";
  return (minutes / 60)
    .toFixed(2)
    .replace(/\.?0+$/, "");
}

/** Sum minutes from entries and format as hours. */
export function totalHours(
  entries: { duration_minutes?: number | null }[],
): string {
  const mins = entries.reduce(
    (acc, e) => acc + (e.duration_minutes ?? 0),
    0,
  );
  return (mins / 60).toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Elapsed time since ISO start as "HH:MM:SS".
 * Used for running timer displays.
 */
export function elapsed(startIso: string): string {
  const diffMs =
    Date.now() - new Date(startIso).getTime();
  const totalSec = Math.max(
    0,
    Math.floor(diffMs / 1000),
  );
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [
    String(h).padStart(2, "0"),
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].join(":");
}

/** Format ISO date string as localized short date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString();
}

/** Format ISO datetime as localized time (HH:MM). */
export function formatTime(
  iso: string | null,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(11, 16);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format ISO date as a short heading, in the selected UI
 * language. Used in the clock widget.
 *
 * The locale was hardcoded to "en-US", which put "Apr 12"
 * next to a heading that says "Heute" the rest of the time:
 * ClockWidget shows either the translated word for today or
 * this. formatDateLabel in dateLabel.ts has always taken
 * i18n.language; this is the same rule.
 */
export function formatDateHeading(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(i18n.language, {
    month: "short",
    day: "numeric",
  });
}
