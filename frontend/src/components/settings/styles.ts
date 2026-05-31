export const DATALIST_ID = "ai-model-list";

// Same token recipe as ``styles/formStyles.ts`` -- the
// surface-overlay + border-strong combination is the only
// pairing that reads as a real input across every theme
// preset.

export const fieldCls = [
  "px-2 py-1 rounded text-xs",
  "bg-surface-overlay border border-strong",
  "text-fg-strong placeholder-fg-muted",
  "focus:outline-none focus:border-cta",
].join(" ");

export const inputCls = [
  "flex-1 px-3 py-1.5 rounded text-sm font-mono",
  "bg-surface-overlay border border-strong",
  "text-fg-strong placeholder-fg-muted",
  "focus:outline-none focus:border-cta",
].join(" ");

export const saveBtnCls = [
  "px-4 py-1.5 rounded text-sm",
  "bg-cta text-white hover:bg-cta-hover",
  "transition-colors disabled:opacity-50",
].join(" ");
