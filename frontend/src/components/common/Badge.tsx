import { ReactNode } from "react";

/** Semantic intent for the badge tint. */
type Variant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "tag";

type Size = "sm" | "md";
type Shape = "pill" | "square";

interface Props {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** Optional tag colour (Tailwind colour name, e.g.
   *  ``"emerald"``). Only used when ``variant="tag"``. */
  color?: string;
  className?: string;
  title?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  neutral:
    "bg-surface-overlay text-fg-muted",
  success:
    "bg-emerald-500/10 text-emerald-600 "
    + "dark:text-emerald-400",
  warning:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger:
    "bg-red-500/10 text-red-600 dark:text-red-400",
  info:
    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  tag:
    // Tag colour is opt-in via the ``color`` prop. When
    // omitted the tag reads as a neutral chip.
    "bg-surface-overlay text-fg",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-4 px-1.5 text-2xs gap-0.5",
  md: "h-5 px-2 text-xs gap-1",
};

const SHAPE_CLASSES: Record<Shape, string> = {
  pill: "rounded-full",
  square: "rounded",
};

/** Tag colour palette — limited to the small set already
 *  established by `TagDropdown` so all chips read coherent.
 *  Each entry is a bg + text pair tuned for both themes
 *  via the existing CSS-var stack.
 *
 *  Tailwind needs literal strings to pick these up at
 *  build time, hence the explicit enumeration rather than
 *  template interpolation.
 */
const TAG_COLOR_CLASSES: Record<string, string> = {
  stone:   "bg-stone-500/15 text-stone-700 dark:text-stone-300",
  red:     "bg-red-500/15 text-red-700 dark:text-red-300",
  orange:  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  amber:   "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  yellow:  "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  lime:    "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  green:   "bg-green-500/15 text-green-700 dark:text-green-300",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  teal:    "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  cyan:    "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  sky:     "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  blue:    "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  indigo:  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  violet:  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  purple:  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  pink:    "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  rose:    "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

/**
 * Unified badge / chip / status pill.
 *
 *     <Badge variant="success">Active</Badge>
 *     <Badge variant="danger" size="md">Overdue</Badge>
 *     <Badge variant="tag" color="emerald">backend</Badge>
 *     <Badge variant="neutral" shape="square">DRAFT</Badge>
 */
export function Badge({
  children,
  variant = "neutral",
  size = "sm",
  shape = "pill",
  color,
  className = "",
  title,
}: Props) {
  const colourClass =
    variant === "tag" && color && TAG_COLOR_CLASSES[color]
      ? TAG_COLOR_CLASSES[color]
      : VARIANT_CLASSES[variant];

  return (
    <span
      title={title}
      className={[
        "inline-flex items-center justify-center",
        "font-medium leading-none whitespace-nowrap",
        SIZE_CLASSES[size],
        SHAPE_CLASSES[shape],
        colourClass,
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </span>
  );
}
