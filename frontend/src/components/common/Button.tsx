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

/** Three sizes aligned to the shared input heights:
 *
 *  - ``sm`` (h-7) pairs with ``smallInputCls``.
 *  - ``md`` (h-8) pairs with ``inputCls`` — the default
 *    and the right pick for most settings forms.
 *  - ``lg`` (h-10) is for prominent landing-page or
 *    dialog primary actions.
 */
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Optional leading icon (e.g. lucide ``<Plus size={14} />``). */
  icon?: ReactNode;
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
  sm: "h-7 px-2.5 text-xs gap-1",
  md: "h-8 px-3 text-sm gap-1.5",
  lg: "h-10 px-4 text-sm gap-2",
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
  icon,
  className = "",
  children,
  type = "button",
  ...rest
}, ref) => (
  <button
    ref={ref}
    type={type}
    className={[
      "inline-flex items-center justify-center",
      "rounded-md font-medium",
      "transition-colors",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      "focus:outline-none focus:ring-2 focus:ring-cta/40",
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      className,
    ].filter(Boolean).join(" ")}
    {...rest}
  >
    {icon}
    {children}
  </button>
));
Button.displayName = "Button";
