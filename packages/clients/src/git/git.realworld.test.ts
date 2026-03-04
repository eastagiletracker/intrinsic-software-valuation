import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { createGitClient } from "./factory.js";

/**
 * Real-world integration test against the ISV Engine repository itself.
 *
 * This test clones the repository, performs a time-travel checkout,
 * verifies files exist, extracts log stats, and cleans up.
 *
 * Requires network access and `git` on PATH.
 * Excluded from the default `vitest run` and only runs via `test:realworld`.
 */
describe("GitClient — real-world", () => {
  const BASE_PATH = resolve("data", "bitgrip", "git");

  // Ensure cleanup even if tests fail
  afterAll(async () => {
    await rm(BASE_PATH, { recursive: true, force: true });
  });

  it(
    "clones, checks out at a timestamp, reads files, extracts log stats, and cleans up",
    async () => {
      // --- Create client ---
      const client = await createGitClient({
        repositories: [
          {
            repositoryId: "isv-engine",
            url: "https://github.com/bitgrip/intrinsic-software-valuation.git",
          },
        ],
        dataFolderName: "bitgrip",
      });

      expect(client.repositoryIds()).toEqual(["isv-engine"]);

      // --- Checkout at a known past date (repo existed by 2025-06-01) ---
      const tree = await client.checkout(
        "isv-engine",
        "2025-06-01T00:00:00Z",
      );

      expect(tree.repositoryId).toBe("isv-engine");
      expect(tree.commitSha).toMatch(/^[0-9a-f]{40}$/i);
      expect(existsSync(tree.workingDir)).toBe(true);

      // Verify the checkout contains expected files
      const files = readdirSync(tree.workingDir);
      expect(files).toContain("package.json");

      // --- Log stats ---
      const stats = await client.logStats("isv-engine", {
        since: "2025-01-01T00:00:00Z",
        until: "2025-06-01T00:00:00Z",
        hotspotLimit: 5,
      });

      expect(stats.linesAdded).toBeGreaterThan(0);
      expect(stats.filesChanged).toBeGreaterThan(0);
      expect(stats.hotspots.length).toBeGreaterThan(0);
      expect(stats.hotspots.length).toBeLessThanOrEqual(5);

      // --- Release single worktree ---
      await client.release(tree);
      expect(existsSync(tree.workingDir)).toBe(false);

      // --- Destroy all artifacts ---
      await client.destroy();
      expect(existsSync(BASE_PATH)).toBe(false);
    },
    { timeout: 120_000 },
  );
});
