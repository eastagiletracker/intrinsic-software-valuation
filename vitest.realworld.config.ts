import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.realworld.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "data/**"],
  },
});
