/** Pure date helpers for the calendar panel.
 *
 *  Kept separate from React so they can be unit-tested
 *  without rendering and so the grid components stay
 *  readable. All "week" calculations are Monday-first to
 *  match the existing sidebar mini-calendar.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAY_HOURS = 24;

/** Return Monday 00:00 (local) of the week containing
 *  ``date``. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
  d.setDate(d.getDate() - day);
  return d;
}

/** Same date with ``days`` added. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** YYYY-MM-DD in local time. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Return 7 dates Monday-first for the week containing
 *  ``anchor``. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) =>
    addDays(start, i),
  );
}

/** Inclusive ISO bounds for a given day (local). */
export function dayBounds(date: Date): {
  from: string; to: string;
} {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

/** Inclusive ISO bounds for the week containing
 *  ``date``. */
export function weekBounds(date: Date): {
  from: string; to: string;
} {
  const start = startOfWeek(date);
  const end = addDays(start, 7);
  end.setMilliseconds(-1);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

/** Inclusive ISO bounds covering the full visible month
 *  grid: from the Monday on/before the 1st through the
 *  Sunday on/after the last day. Returns 6 weeks worth so
 *  the grid stays a constant 6x7. */
export function monthBounds(date: Date): {
  from: string; to: string;
} {
  const first = new Date(
    date.getFullYear(), date.getMonth(), 1,
  );
  const start = startOfWeek(first);
  const end = addDays(start, 7 * 6);
  end.setMilliseconds(-1);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

/** 42 dates (6 weeks) covering the month containing
 *  ``anchor``; Monday-first; spills into previous/next
 *  months at the edges. */
export function monthGridDays(anchor: Date): Date[] {
  const first = new Date(
    anchor.getFullYear(), anchor.getMonth(), 1,
  );
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) =>
    addDays(start, i),
  );
}

/** Same date with ``months`` added (clamped if the target
 *  month is shorter, matching how Date does it). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}


/** Bare YYYY-MM-DD without a time component. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an ISO datetime to a local Date.
 *
 *  Bare ``YYYY-MM-DD`` (the all-day form CalDAV servers
 *  emit) is parsed as **local midnight**. The browser's
 *  default `new Date("2026-05-30")` parses as UTC, which
 *  in any TZ west of UTC shifts the event onto the
 *  preceding day in the panel grid (regression seen
 *  during the 2026-05-30 review).
 */
export function parseIso(value: string): Date {
  if (DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

/** Hours since midnight (fractional) for placement on
 *  the grid. Returns a float in [0, 24]. */
export function hoursFromMidnight(date: Date): number {
  return (
    date.getHours()
    + date.getMinutes() / 60
    + date.getSeconds() / 3600
  );
}

/** Whether two dates fall on the same local calendar
 *  day. */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

/** ISO-8601 week number (1-53) for ``date``.
 *
 *  Monday-first weeks; the week containing the year's
 *  first Thursday is week 1. Matches ``%V`` in ``date(1)``
 *  and ``Intl.DateTimeFormat`` week behaviour in browsers
 *  that support it.
 */
export function isoWeek(date: Date): number {
  // Anchor on Thursday of the same ISO week to avoid the
  // Jan 1 / Dec 31 boundary cases.
  const d = new Date(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
  ));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(
    d.getUTCFullYear(), 0, 1,
  ));
  return Math.ceil(
    (((d.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1)
    / 7,
  );
}


/** Format a Date as "HH:mm" (24h, local). */
export function hhmm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export { DAY_HOURS, MS_PER_DAY };
