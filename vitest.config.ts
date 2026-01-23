import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "lib/**/__tests__/**/*.test.ts",
      "server/**/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    // Run tests sequentially to avoid database conflicts
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
    // Increase test timeout for integration tests
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "lib/generated/",
        "tests/",
        "**/*.config.*",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
