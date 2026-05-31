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
