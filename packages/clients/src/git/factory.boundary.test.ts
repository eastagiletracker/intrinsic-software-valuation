import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createGitClient } from "./factory.js";

// ---------------------------------------------------------------------------
// GitClient concurrency & fault-tolerance (Tier 3 — boundary)
//
// Uses a real bare clone of this repo (same pattern as factory.test.ts)
// to verify the full checkout → release lifecycle under realistic
// concurrent workloads.
// ---------------------------------------------------------------------------

describe("GitClient — concurrent worktree lifecycle", () => {
  const BASE_PATH = resolve("data", "test-git-concurrency", "git");

  afterEach(async () => {
    await rm(resolve("data", "test-git-concurrency"), {
      recursive: true,
      force: true,
    });
  });

  async function makeClient() {
    return createGitClient({
      repositories: [
        { repositoryId: "self", localPath: resolve(".") },
      ],
      dataFolderName: "test-git-concurrency",
    });
  }

  it("checkoutAll returns unique working directories per call", async () => {
    const client = await makeClient();
    const before = new Date().toISOString();

    try {
      const trees1 = await client.checkoutAll(before);
      const trees2 = await client.checkoutAll(before);

      const dir1 = trees1.get("self")!.workingDir;
      const dir2 = trees2.get("self")!.workingDir;

      // Same commit, different directories
      expect(trees1.get("self")!.commitSha).toBe(
        trees2.get("self")!.commitSha,
      );
      expect(dir1).not.toBe(dir2);
      expect(existsSync(dir1)).toBe(true);
      expect(existsSync(dir2)).toBe(true);
    } finally {
      await client.releaseAll();
      await client.destroy();
    }
  });

  it("parallel checkoutAll calls do not collide", { timeout: 30_000 }, async () => {
    const client = await makeClient();
    const before = new Date().toISOString();

    try {
      // Simulate the calibration pattern: 3 concurrent cluster checkouts
      const [trees1, trees2, trees3] = await Promise.all([
        client.checkoutAll(before),
        client.checkoutAll(before),
        client.checkoutAll(before),
      ]);

      const dirs = [
        trees1.get("self")!.workingDir,
        trees2.get("self")!.workingDir,
        trees3.get("self")!.workingDir,
      ];

      expect(new Set(dirs).size).toBe(3);
    } finally {
      await client.releaseAll();
      await client.destroy();
    }
  });

  it("releaseAll succeeds even when some worktrees are already removed", async () => {
    const client = await makeClient();
    const before = new Date().toISOString();

    const trees = await client.checkoutAll(before);
    const dir = trees.get("self")!.workingDir;

    // Simulate external interference: manually delete the worktree directory
    await rm(dir, { recursive: true, force: true });

    // releaseAll must not throw — it should tolerate missing directories
    await expect(client.releaseAll()).resolves.toBeUndefined();

    await client.destroy();
  });

  it("release of one checkout does not break a concurrent checkout at the same commit", async () => {
    const client = await makeClient();
    const before = new Date().toISOString();

    const trees1 = await client.checkoutAll(before);
    const trees2 = await client.checkoutAll(before);

    const dir1 = trees1.get("self")!.workingDir;
    const dir2 = trees2.get("self")!.workingDir;

    // Release the first — the second must remain intact
    await client.release(trees1.get("self")!);
    expect(existsSync(dir1)).toBe(false);
    expect(existsSync(dir2)).toBe(true);

    await client.release(trees2.get("self")!);
    await client.destroy();
  });
});
