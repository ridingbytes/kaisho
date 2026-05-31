/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // App toggles dark via `data-theme="dark"` on <html>, not the
  // default `.dark` class. Map Tailwind's `dark:` prefix onto
  // that attribute so dark-variant utilities (e.g.
  // `dark:text-violet-100`) actually fire.
  darkMode: ["selector", '[data-theme="dark"]'],
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
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
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
