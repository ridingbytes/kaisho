/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "#0c0e14",
          card: "#161b27",
          raised: "#1e2535",
          overlay: "#252d40",
        },
        border: {
          subtle: "rgba(255,255,255,0.06)",
          DEFAULT: "rgba(255,255,255,0.10)",
          strong: "rgba(255,255,255,0.18)",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          muted: "rgba(99,102,241,0.15)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        "card-hover":
          "0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)",
        "card-drag":
          "0 20px 40px rgba(0,0,0,0.6), 0 8px 16px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};
