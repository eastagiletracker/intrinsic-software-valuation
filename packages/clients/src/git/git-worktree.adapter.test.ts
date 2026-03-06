import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseCommitSha, parseLogStats } from "./git-worktree.adapter.js";
import { GitWorktreeAdapter } from "./git-worktree.adapter.js";
import type { PreparedRepo } from "./port.js";

// ---------------------------------------------------------------------------
// parseCommitSha
// ---------------------------------------------------------------------------

describe("parseCommitSha", () => {
  it("extracts a valid 40-char hex SHA", () => {
    const sha = "abc1234567890def1234567890abcdef12345678";
    expect(parseCommitSha(`${sha}\n`)).toBe(sha);
  });

  it("extracts the first SHA when multiple lines are present", () => {
    const first = "abc1234567890def1234567890abcdef12345678";
    const second = "1111111111111111111111111111111111111111";
    expect(parseCommitSha(`${first}\n${second}\n`)).toBe(first);
  });

  it("returns undefined for empty output", () => {
    expect(parseCommitSha("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only output", () => {
    expect(parseCommitSha("   \n  \n")).toBeUndefined();
  });

  it("returns undefined for non-hex strings", () => {
    expect(parseCommitSha("not-a-sha")).toBeUndefined();
  });

  it("returns undefined for short hex strings", () => {
    expect(parseCommitSha("abc123")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const sha = "abc1234567890def1234567890abcdef12345678";
    expect(parseCommitSha(`  ${sha}  \n`)).toBe(sha);
  });
});

// ---------------------------------------------------------------------------
// parseLogStats
// ---------------------------------------------------------------------------

describe("parseLogStats", () => {
  it("parses numstat lines correctly", () => {
    const output = [
      "10\t5\tsrc/index.ts",
      "20\t3\tsrc/utils.ts",
      "5\t0\tsrc/index.ts",
    ].join("\n");

    const stats = parseLogStats(output);

    expect(stats.linesAdded).toBe(35);
    expect(stats.linesDeleted).toBe(8);
    expect(stats.filesChanged).toBe(2);
  });

  it("returns zero stats for empty output", () => {
    const stats = parseLogStats("");

    expect(stats.linesAdded).toBe(0);
    expect(stats.linesDeleted).toBe(0);
    expect(stats.filesChanged).toBe(0);
    expect(stats.hotspots).toEqual([]);
  });

  it("skips non-numstat lines (commit messages, blank lines)", () => {
    const output = [
      "",
      "commit abc123",
      "Author: Test",
      "",
      "10\t5\tsrc/file.ts",
      "",
    ].join("\n");

    const stats = parseLogStats(output);

    expect(stats.linesAdded).toBe(10);
    expect(stats.linesDeleted).toBe(5);
    expect(stats.filesChanged).toBe(1);
  });

  it("sorts hotspots by change count descending", () => {
    const output = [
      "1\t0\ta.ts",
      "1\t0\tb.ts",
      "1\t0\tb.ts",
      "1\t0\tc.ts",
      "1\t0\tc.ts",
      "1\t0\tc.ts",
    ].join("\n");

    const stats = parseLogStats(output);

    expect(stats.hotspots[0]).toEqual({ file: "c.ts", changeCount: 3 });
    expect(stats.hotspots[1]).toEqual({ file: "b.ts", changeCount: 2 });
    expect(stats.hotspots[2]).toEqual({ file: "a.ts", changeCount: 1 });
  });

  it("respects hotspotLimit", () => {
    const output = [
      "1\t0\ta.ts",
      "1\t0\tb.ts",
      "1\t0\tc.ts",
    ].join("\n");

    const stats = parseLogStats(output, 2);

    expect(stats.hotspots).toHaveLength(2);
  });

  it("handles files with tabs in their path", () => {
    const output = "10\t5\tpath/to\tfile.ts\n";

    const stats = parseLogStats(output);

    expect(stats.filesChanged).toBe(1);
    expect(stats.hotspots[0].file).toBe("path/to\tfile.ts");
  });
});

// ---------------------------------------------------------------------------
// Worktree isolation (Tier 1 — uses real bare clone of this repo)
// ---------------------------------------------------------------------------

describe("GitWorktreeAdapter — worktree isolation", () => {
  const BASE_PATH = resolve("data", "test-worktree-isolation", "git");
  const WORK_PATH = resolve(BASE_PATH, "work");
  const adapter = new GitWorktreeAdapter();

  afterEach(async () => {
    await rm(BASE_PATH, { recursive: true, force: true });
  });

  async function prepareLocalRepo(): Promise<PreparedRepo> {
    return adapter.prepare(
      { repositoryId: "self", localPath: resolve(".") },
      BASE_PATH,
    );
  }

  it("generates unique worktree paths for the same commit", async () => {
    const repo = await prepareLocalRepo();
    const before = new Date().toISOString();

    const tree1 = await adapter.checkout(repo, before, WORK_PATH);
    const tree2 = await adapter.checkout(repo, before, WORK_PATH);

    try {
      // Both resolve to the same commit SHA
      expect(tree1.commitSha).toBe(tree2.commitSha);
      // But they have different working directories
      expect(tree1.workingDir).not.toBe(tree2.workingDir);
      // Both directories exist on disk
      expect(existsSync(tree1.workingDir)).toBe(true);
      expect(existsSync(tree2.workingDir)).toBe(true);
    } finally {
      await adapter.release(tree1);
      await adapter.release(tree2);
    }
  });

  it("parallel checkouts of the same commit do not collide", async () => {
    const repo = await prepareLocalRepo();
    const before = new Date().toISOString();

    // Run 5 concurrent checkouts — the old code would fail on all but the first
    const trees = await Promise.all(
      Array.from({ length: 5 }, () => adapter.checkout(repo, before, WORK_PATH)),
    );

    try {
      const dirs = trees.map((t) => t.workingDir);
      const uniqueDirs = new Set(dirs);
      // All 5 paths must be unique
      expect(uniqueDirs.size).toBe(5);
      // All resolve to the same commit
      const shas = new Set(trees.map((t) => t.commitSha));
      expect(shas.size).toBe(1);
      // All directories actually exist
      for (const tree of trees) {
        expect(existsSync(tree.workingDir)).toBe(true);
      }
    } finally {
      for (const tree of trees) {
        await adapter.release(tree);
      }
    }
  });

  it("releasing one worktree does not affect another at the same commit", async () => {
    const repo = await prepareLocalRepo();
    const before = new Date().toISOString();

    const tree1 = await adapter.checkout(repo, before, WORK_PATH);
    const tree2 = await adapter.checkout(repo, before, WORK_PATH);

    // Release tree1 — tree2 must remain intact
    await adapter.release(tree1);
    expect(existsSync(tree1.workingDir)).toBe(false);
    expect(existsSync(tree2.workingDir)).toBe(true);

    await adapter.release(tree2);
    expect(existsSync(tree2.workingDir)).toBe(false);
  });
});
