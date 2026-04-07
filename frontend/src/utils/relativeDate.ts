/**
 * Format a date string as a relative time label
 * (GitHub-style), e.g. "just now", "yesterday",
 * "3 days ago", "2 weeks ago", "Jan 15".
 *
 * Returns an object with `label` (display text) and
 * `full` (ISO date for title/tooltip).
 */
export function relativeDate(
  isoOrOrg: string,
): { label: string; full: string } {
  if (!isoOrOrg) return { label: "", full: "" };

  // Strip org-mode brackets: [2026-04-07 Mon 14:30]
  const clean = isoOrOrg
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  const full = clean.slice(0, 16); // YYYY-MM-DD HH:MM

  const date = new Date(clean);
  if (isNaN(date.getTime())) {
    return { label: isoOrOrg.slice(0, 10), full };
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffSec < 60) return { label: "just now", full };
  if (diffMin < 60) {
    return {
      label: diffMin === 1
        ? "1 minute ago"
        : `${diffMin} minutes ago`,
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
  if (diffD === 1) return { label: "yesterday", full };
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
    const m = Math.floor(diffD / 30);
    return {
      label: m === 1
        ? "1 month ago"
        : `${m} months ago`,
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
