import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";

/** Visual intent.
 *
 *  - ``primary``   — solid CTA. The main affordance in a
 *                    form/section. One per panel ideally.
 *  - ``secondary`` — outlined neutral. Sits alongside
 *                    primary (e.g. ``Cancel``) or used
 *                    standalone for non-CTA actions like
 *                    ``+ Add source``.
 *  - ``ghost``     — bare button. Toolbar / row affordances
 *                    that should disappear into the
 *                    surface.
 *  - ``danger``    — destructive. Reserved for delete /
 *                    destroy actions.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Four sizes aligned to the shared input heights and the
 *  dense table/tray pill aesthetic:
 *
 *  - ``xs`` (h-6) pairs with ``text-2xs`` dense rows
 *    (kanban cards, tray pills, table affordances).
 *  - ``sm`` (h-7) pairs with ``smallInputCls``.
 *  - ``md`` (h-8) pairs with ``inputCls`` — the default
 *    and the right pick for most settings forms.
 *  - ``lg`` (h-10) is for prominent landing-page or
 *    dialog primary actions.
 */
type Size = "xs" | "sm" | "md" | "lg";

/** Outer shape. Default ``rounded`` rectangular pill;
 *  ``pill`` is the fully-rounded chip used in tray /
 *  kanban / clock surfaces. */
type Shape = "rounded" | "pill";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** Optional leading icon (e.g. lucide ``<Plus size={14} />``). */
  icon?: ReactNode;
  /** Square button (equal padding on both axes). Use for
   *  toolbar icon buttons. Implies ``icon`` provides the
   *  whole visual; ``children`` becomes accessible label
   *  only. */
  iconOnly?: boolean;
  /** Extra utility classes. Use sparingly — most styling
   *  should come from variant + size to keep the look
   *  consistent across the app. */
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-cta text-white hover:bg-cta-hover "
    + "disabled:hover:bg-cta",
  secondary:
    "bg-surface-overlay border border-strong "
    + "text-fg-strong hover:border-cta hover:text-cta",
  ghost:
    "text-fg-muted "
    + "hover:text-cta hover:bg-cta-muted",
  danger:
    "text-danger hover:bg-red-500/10",
};

const SIZE_CLASSES: Record<Size, string> = {
  xs: "h-6 px-2 text-2xs gap-1",
  sm: "h-7 px-2.5 text-xs gap-1",
  md: "h-8 px-3 text-sm gap-1.5",
  lg: "h-10 px-4 text-sm gap-2",
};

/** Icon-only buttons square off — equal padding on both
 *  axes so they read as a glyph, not a label cluster. */
const ICON_ONLY_CLASSES: Record<Size, string> = {
  xs: "h-6 w-6 px-0",
  sm: "h-7 w-7 px-0",
  md: "h-8 w-8 px-0",
  lg: "h-10 w-10 px-0",
};

const SHAPE_CLASSES: Record<Shape, string> = {
  rounded: "rounded-md",
  pill: "rounded-full",
};

/**
 * Single source of truth for all button styling.
 *
 * Replaces ad-hoc ``className="px-3 py-1.5 rounded ..."``
 * strings that drifted across panels. Use this for every
 * button unless the design genuinely calls for something
 * bespoke (e.g. theme-coloured integration chip).
 *
 *     <Button variant="primary" onClick={save}>
 *       Save
 *     </Button>
 *
 *     <Button variant="secondary" icon={<Plus size={14} />}>
 *       Add source
 *     </Button>
 *
 *     <Button variant="danger" size="sm" onClick={remove}>
 *       Delete
 *     </Button>
 */
export const Button = forwardRef<HTMLButtonElement, Props>(({
  variant = "primary",
  size = "md",
  shape = "rounded",
  icon,
  iconOnly = false,
  className = "",
  children,
  type = "button",
  ...rest
}, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={
      iconOnly && typeof children === "string"
        ? children
        : rest["aria-label"]
    }
    className={[
      "inline-flex items-center justify-center",
      "font-medium",
      "transition-colors",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      "focus:outline-none focus:ring-2 focus:ring-cta/40",
      SHAPE_CLASSES[shape],
      iconOnly ? ICON_ONLY_CLASSES[size] : SIZE_CLASSES[size],
      VARIANT_CLASSES[variant],
      className,
    ].filter(Boolean).join(" ")}
    {...rest}
  >
    {icon}
    {iconOnly ? null : children}
  </button>
));
Button.displayName = "Button";
