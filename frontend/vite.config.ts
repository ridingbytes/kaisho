import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        tray: "tray.html",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8765",
      "/ws": {
        target: "ws://localhost:8765",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
