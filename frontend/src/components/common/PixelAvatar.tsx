/**
 * Multi-style avatar renderer.
 *
 * All styles run fully client-side -- no network calls, no
 * leaking the seed (which is typically a user or customer
 * name) to a third party. The default ``invaders`` style is
 * inlined; DiceBear styles are lazy-imported so the main
 * bundle only ships the renderer for the style currently in
 * use.
 *
 * The component name is preserved for backwards compatibility
 * with existing callers; conceptually it is a generic Avatar
 * now.
 */
import {
  useEffect, useMemo, useState,
} from "react";

export type AvatarStyle =
  | "invaders"
  | "pixel-art"
  | "bottts"
  | "adventurer";

export const AVATAR_STYLES: AvatarStyle[] = [
  "invaders",
  "pixel-art",
  "bottts",
  "adventurer",
];

export const DEFAULT_AVATAR_STYLE: AvatarStyle = "invaders";

interface PixelAvatarProps {
  seed: string;
  size?: number;
  style?: AvatarStyle | string;
  className?: string;
  onClick?: () => void;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateGrid(hash: number): boolean[] {
  const grid: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = (hash >> (row * 3 + col)) & 1;
      grid[row * 5 + col] = bit === 1;
      grid[row * 5 + (4 - col)] = bit === 1;
    }
    const centerBit = (hash >> (15 + row)) & 1;
    grid[row * 5 + 2] = centerBit === 1;
  }
  return grid;
}

function renderInvaders(
  seed: string, size: number,
): JSX.Element {
  const hash = hashCode(seed);
  const grid = generateGrid(hash);
  const hue = hash % 360;
  const fill = `hsl(${hue}, 60%, 55%)`;
  const cellSize = size / 5;
  return (
    <>
      <rect
        width={size}
        height={size}
        rx={size * 0.15}
        fill="var(--surface-raised)"
      />
      {grid.map((on, i) => {
        if (!on) return null;
        const row = Math.floor(i / 5);
        const col = i % 5;
        return (
          <rect
            key={i}
            x={col * cellSize}
            y={row * cellSize}
            width={cellSize}
            height={cellSize}
            fill={fill}
          />
        );
      })}
    </>
  );
}

// Lazy-loaded DiceBear style modules so the main bundle
// only carries the renderer that is actually selected. Each
// DiceBear style module exports its definition as a
// collection of named exports (``meta``, ``create``,
// ``schema``) -- ``createAvatar`` accepts the whole module
// object as the style argument.
const DICEBEAR_LOADERS: Record<
  string, () => Promise<unknown>
> = {
  "pixel-art": () => import("@dicebear/pixel-art"),
  bottts: () => import("@dicebear/bottts"),
  adventurer: () => import("@dicebear/adventurer"),
};

async function renderDicebearDataUri(
  style: string, seed: string,
): Promise<string> {
  const [{ createAvatar }, mod] = await Promise.all([
    import("@dicebear/core"),
    DICEBEAR_LOADERS[style](),
  ]);
  const svg = createAvatar(
    mod as Parameters<typeof createAvatar>[0],
    { seed },
  ).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function resolveStyle(value: string | undefined): AvatarStyle {
  if (
    value
    && (AVATAR_STYLES as string[]).includes(value)
  ) {
    return value as AvatarStyle;
  }
  return DEFAULT_AVATAR_STYLE;
}

export function PixelAvatar({
  seed,
  size = 32,
  style,
  className,
  onClick,
}: PixelAvatarProps) {
  const resolved = resolveStyle(style);
  const [dataUri, setDataUri] = useState<string | null>(null);

  useEffect(() => {
    if (resolved === "invaders") {
      setDataUri(null);
      return;
    }
    let cancelled = false;
    renderDicebearDataUri(resolved, seed).then((uri) => {
      if (!cancelled) setDataUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [resolved, seed]);

  const wrapperClass = useMemo(
    () => [
      className,
      onClick ? "cursor-pointer" : "",
    ]
      .filter(Boolean)
      .join(" "),
    [className, onClick],
  );

  const ariaLabel = `Avatar for ${seed}`;

  // For DiceBear styles, display via <img src="data:..."> so
  // we avoid any HTML-injection concern: the SVG payload
  // travels through a URI scheme that browsers parse in
  // their own context, not as part of the host DOM.
  if (resolved !== "invaders" && dataUri) {
    return (
      <img
        src={dataUri}
        width={size}
        height={size}
        className={wrapperClass}
        onClick={onClick}
        alt={ariaLabel}
      />
    );
  }

  // Default and pre-load fallback: render the invaders
  // sprite inline so the slot is never empty.
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={wrapperClass}
      onClick={onClick}
      role="img"
      aria-label={ariaLabel}
    >
      {renderInvaders(seed, size)}
    </svg>
  );
}
