/**
 * Shared form input class strings.
 * Two variants: standard and compact.
 *
 * Standard: used in forms, settings, full-width contexts.
 * Compact: used in inline edits, table cells, sidebars.
 */

/** Standard form input (text-sm, rounded). */
export const inputCls = [
  "w-full px-3 py-2 rounded text-sm",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
  "transition-colors",
].join(" ");

/** Compact form input (text-xs, smaller padding). */
export const smallInputCls = [
  "w-full px-2 py-1 rounded text-xs",
  "bg-surface-raised border border-border",
  "text-stone-900 placeholder-stone-500",
  "focus:outline-none focus:border-cta",
].join(" ");

/** Bordered action button (e.g. "Add contract"). */
export const actionBtnCls = [
  "inline-flex items-center gap-1",
  "px-2.5 py-1 rounded text-[10px]",
  "font-medium border border-border",
  "text-stone-600",
  "hover:border-cta hover:text-cta",
  "transition-colors",
].join(" ");
