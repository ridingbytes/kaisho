import i18n from "../i18n";

/** Format a date-only ISO string (``YYYY-MM-DD``) in the
 * currently selected UI language.
 *
 * Parses as a local date (not UTC) so the day never shifts
 * by a timezone offset when formatted. Returns "" for a
 * missing value and the raw input if it isn't a date. */
export function formatDateLabel(
  iso?: string | null,
): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const date = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
  );
  return date.toLocaleDateString(i18n.language, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
