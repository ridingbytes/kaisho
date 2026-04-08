/**
 * Format a date string as a relative time label
 * (GitHub-style), e.g. "just now", "yesterday",
 * "3 days ago", "2 weeks ago".
 *
 * Returns { label, full } where full is the date
 * string for tooltip display.
 */

const ORG_DATE_RE =
  /^(\d{4}-\d{2}-\d{2})\s+\w{3}\s+(\d{2}:\d{2})/;

function parseDate(raw: string): Date | null {
  const s = raw.replace(/^\[/, "").replace(/\]$/, "");

  // Org format: "2026-04-05 Sat 09:00"
  const m = ORG_DATE_RE.test(s)
    ? s.match(ORG_DATE_RE)
    : null;
  if (m) {
    return new Date(`${m[1]}T${m[2]}:00`);
  }

  // ISO or other parseable format
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Date part only
  const dateOnly = s.slice(0, 10);
  const d2 = new Date(dateOnly + "T00:00:00");
  if (!isNaN(d2.getTime())) return d2;

  return null;
}


export function relativeDate(
  raw: string,
): { label: string; full: string } {
  if (!raw) return { label: "", full: "" };

  const date = parseDate(raw);
  if (!date) {
    const fallback = raw
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .slice(0, 16);
    return { label: raw.slice(0, 10), full: fallback };
  }
  const full = date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffSec < 0) return { label: full, full };
  if (diffSec < 60) {
    return { label: "just now", full };
  }
  if (diffMin < 60) {
    return {
      label: diffMin === 1
        ? "1 min ago"
        : `${diffMin} min ago`,
      full,
    };
  }
  if (diffH < 24) {
    return {
      label: diffH === 1
        ? "1 hour ago"
        : `${diffH} hours ago`,
      full,
    };
  }
  if (diffD === 1) {
    return { label: "yesterday", full };
  }
  if (diffD < 7) {
    return { label: `${diffD} days ago`, full };
  }
  if (diffD < 30) {
    const w = Math.floor(diffD / 7);
    return {
      label: w === 1
        ? "1 week ago"
        : `${w} weeks ago`,
      full,
    };
  }
  if (diffD < 365) {
    const mo = Math.floor(diffD / 30);
    return {
      label: mo === 1
        ? "1 month ago"
        : `${mo} months ago`,
      full,
    };
  }
  const y = Math.floor(diffD / 365);
  return {
    label: y === 1
      ? "1 year ago"
      : `${y} years ago`,
    full,
  };
}
