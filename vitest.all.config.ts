import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs ALL tests including *.realworld.test.ts
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
