import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    include: ["tests/unit/**/*.test.ts"],
    // Unit tests for main process utils should run in Node environment
    environment: "node",
    // Timeout: some tests create temp files and run async validation
    testTimeout: 15_000,
  },
});
