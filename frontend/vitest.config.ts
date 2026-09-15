import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom rather than node: the utilities under test are
    // pure, but several of them reach for localStorage or
    // Intl through the browser globals, and a component
    // test needs a DOM the moment one is written.
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
