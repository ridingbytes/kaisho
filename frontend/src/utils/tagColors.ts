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
