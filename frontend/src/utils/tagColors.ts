/**
 * Tag badge styles: tinted background with colored text.
 */
export function tagBadgeStyle(
  color: string | undefined,
): React.CSSProperties {
  const hex = color || "#64748b";
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return { backgroundColor: hex, color: "#fff" };
  }
  return {
    backgroundColor:
      `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`,
    color: `rgb(${rgb.r},${rgb.g},${rgb.b})`,
  };
}

/**
 * Curated palette for free-text tags. Picked for
 * legibility on the light surface; same input always maps
 * to the same color so the user can recognize tags by hue
 * at a glance.
 */
const FREE_TAG_PALETTE = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#c026d3",
  "#db2777",
  "#475569",
] as const;

/**
 * Deterministic auto-color for a free-text tag string.
 * Uses a small djb2 hash so the same tag maps to the same
 * palette slot across sessions and devices.
 */
export function autoTagColor(tag: string): string {
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) + hash + tag.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % FREE_TAG_PALETTE.length;
  return FREE_TAG_PALETTE[idx];
}

/**
 * Convenience for rendering a free-text tag chip without
 * passing an explicit color.
 */
export function freeTagBadgeStyle(
  tag: string,
): React.CSSProperties {
  return tagBadgeStyle(autoTagColor(tag));
}

function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
    .exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}
