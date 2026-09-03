import path from "node:path";
import { defineConfig } from "vitest/config";

// Minimal config: pure-logic + Request/Response-based tests, so plain node
// environment is enough — no jsdom. Alias mirrors tsconfig's "@/*".
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
