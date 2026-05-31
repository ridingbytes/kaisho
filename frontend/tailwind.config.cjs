/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // The app picks one of 12 theme presets via
  // ``data-theme="<id>"`` on <html>. Six of those presets
  // are dark (zinc-dark / solarized / dracula / nord /
  // tokyo-night / mocha). The Tailwind ``dark:`` prefix
  // needs to fire for ALL of them -- the previous setup
  // only matched ``[data-theme="dark"]`` so dark-variant
  // utilities silently disappeared in dracula / nord /
  // etc. and the calendar tile text rendered as dark
  // purple on dark purple.
  //
  // Listing every dark id explicitly is required because
  // Tailwind needs a literal selector here, not a regex
  // or attribute-value match. New dark presets must be
  // added to this list.
  darkMode: [
    "variant",
    [
      '&:where([data-theme="dark"] *)',
      '&:where([data-theme="solarized"] *)',
      '&:where([data-theme="dracula"] *)',
      '&:where([data-theme="nord"] *)',
      '&:where([data-theme="tokyo-night"] *)',
      '&:where([data-theme="mocha"] *)',
      '&[data-theme="dark"]',
      '&[data-theme="solarized"]',
      '&[data-theme="dracula"]',
      '&[data-theme="nord"]',
      '&[data-theme="tokyo-night"]',
      '&[data-theme="mocha"]',
    ],
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "var(--surface-base)",
          card: "var(--surface-card)",
          raised: "var(--surface-raised)",
          overlay: "var(--surface-overlay)",
        },
        border: {
          subtle: "var(--border-subtle)",
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
        },
        cta: {
          DEFAULT: "var(--cta)",
          hover: "var(--cta-hover)",
          muted: "var(--cta-muted)",
        },
        // Semantic foreground (text) tokens. Pick by intent,
        // not by stone shade. To re-theme the app, edit the
        // matching CSS vars in index.css — every utility
        // below re-resolves at runtime.
        //   text-fg          → body default
        //   text-fg-strong   → titles / emphasis
        //   text-fg-muted    → secondary / captions
        //   text-fg-subtle   → placeholders / metadata
        //   text-fg-disabled → ghosted / read-only
        fg: {
          DEFAULT: "var(--text-secondary)",
          strong: "var(--text-primary)",
          muted: "var(--text-tertiary)",
          subtle: "var(--text-muted)",
          disabled: "var(--text-disabled)",
        },
        // Status (theme-aware): use these instead of raw
        // green-500 / red-500 so dark mode can re-balance
        // luminance without per-occurrence dark: variants.
        success: { DEFAULT: "var(--status-success)" },
        warning: { DEFAULT: "var(--status-warning)" },
        danger:  { DEFAULT: "var(--status-danger)" },
        info:    { DEFAULT: "var(--status-info)" },
      },
      fontSize: {
        // 10px / 14px line-height -- the "data-dense"
        // size used for table cells, eyebrows, dense
        // badges. Adding this kills 294 arbitrary
        // ``text-[10px]`` / ``text-[9px]`` usages.
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      fontFamily: {
        // Resolves at runtime to whatever the active theme
        // / user has set via --app-font. Components using
        // `font-sans` (or no font utility) pick this up
        // automatically.
        sans: "var(--app-font)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        "card-drag": "var(--shadow-card-drag)",
      },
    },
  },
  plugins: [],
};
