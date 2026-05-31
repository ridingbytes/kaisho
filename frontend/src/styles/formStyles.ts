/**
 * Shared form input class strings.
 * Two variants: standard and compact.
 *
 * Standard: used in forms, settings, full-width contexts.
 * Compact: used in inline edits, table cells, sidebars.
 */

// Width is intentionally NOT in the shared recipes. Putting
// `w-full` here silently overrides any caller-supplied
// `w-14` / `w-24` (Tailwind's generated CSS for `w-full`
// sits after the numeric scales, so the recipe wins) and
// produces the classic "hours field is 600px wide" bug.
// Callers using these for stacked form fields add `w-full`
// at the call site.
//
// Tokens: `bg-surface-overlay + border-strong` so the input
// reads as a real input across every preset, not just the
// default zinc theme. In sepia / gruvbox / solarized the
// raised tint sits too close to typical row backgrounds for
// `bg-surface-raised + border` to register.

/** Standard form input (text-sm, rounded).
 *  Fixed height ensures inputs and selects align. */
export const inputCls = [
  "px-3 py-1.5 rounded text-sm h-8",
  "bg-surface-overlay border border-strong",
  "text-fg-strong placeholder-fg-muted",
  "focus:outline-none focus:border-cta",
  "transition-colors",
].join(" ");

/** Compact form input (text-xs, smaller padding).
 *  Use for toolbar inputs, selects, and date pickers
 *  that must share the same row height. */
export const smallInputCls = [
  "px-2 py-1 rounded text-xs h-7",
  "bg-surface-overlay border border-strong",
  "text-fg-strong placeholder-fg-muted",
  "focus:outline-none focus:border-cta",
].join(" ");

/** Bordered action button (e.g. "Add contract"). */
export const actionBtnCls = [
  "inline-flex items-center gap-1",
  "px-2.5 py-1 rounded text-2xs",
  "font-medium border border-border",
  "text-fg-muted",
  "hover:border-cta hover:text-cta",
  "transition-colors",
].join(" ");
