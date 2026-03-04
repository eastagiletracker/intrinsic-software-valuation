import { describe, expect, it, vi } from "vitest";

import { FileCache } from "../cache/file-cache.js";
import type { CacheConfig } from "../cache/cache-config.schema.js";

import { CachedGitClient } from "./cached-git-client.js";
import type { GitClient } from "./client.js";
import type { GitLogStats, WorkingTree } from "./port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogStats(): GitLogStats {
  return {
    linesAdded: 500,
    linesDeleted: 200,
    filesChanged: 15,
    hotspots: [{ file: "src/index.ts", changeCount: 10 }],
  };
}

function makeWorkingTree(id = "backend"): WorkingTree {
  return {
    repositoryId: id,
    workingDir: "/tmp/work/backend",
    commitSha: "abc123",
  };
}

function mockInner(): GitClient {
  return {
    repositoryIds: vi.fn<GitClient["repositoryIds"]>().mockReturnValue(["backend"]),
    checkoutAll: vi.fn<GitClient["checkoutAll"]>().mockResolvedValue(
      new Map([["backend", makeWorkingTree()]]),
    ),
    checkout: vi.fn<GitClient["checkout"]>().mockResolvedValue(makeWorkingTree()),
    release: vi.fn<GitClient["release"]>().mockResolvedValue(undefined),
    releaseAll: vi.fn<GitClient["releaseAll"]>().mockResolvedValue(undefined),
    logStats: vi.fn<GitClient["logStats"]>().mockResolvedValue(makeLogStats()),
    destroy: vi.fn<GitClient["destroy"]>().mockResolvedValue(undefined),
  };
}

function disabledCache(): FileCache {
  return new FileCache({ enabled: false, cacheDir: "/tmp/unused" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CachedGitClient", () => {
  // --- Pass-through methods (not cached) ---

  it("delegates repositoryIds directly to inner client", () => {
    const inner = mockInner();
    const cached = new CachedGitClient(inner, disabledCache());

    const ids = cached.repositoryIds();

    expect(inner.repositoryIds).toHaveBeenCalledOnce();
    expect(ids).toEqual(["backend"]);
  });

  it("delegates checkout directly to inner client", async () => {
    const inner = mockInner();
    const cached = new CachedGitClient(inner, disabledCache());

    const tree = await cached.checkout("backend", "2024-01-01T00:00:00Z");

    expect(inner.checkout).toHaveBeenCalledWith("backend", "2024-01-01T00:00:00Z");
    expect(tree.repositoryId).toBe("backend");
  });

  it("delegates checkoutAll directly to inner client", async () => {
    const inner = mockInner();
    const cached = new CachedGitClient(inner, disabledCache());

    await cached.checkoutAll("2024-01-01T00:00:00Z");

    expect(inner.checkoutAll).toHaveBeenCalledWith("2024-01-01T00:00:00Z");
  });

  it("delegates release directly to inner client", async () => {
    const inner = mockInner();
    const cached = new CachedGitClient(inner, disabledCache());
    const tree = makeWorkingTree();

    await cached.release(tree);

    expect(inner.release).toHaveBeenCalledWith(tree);
  });

  it("delegates releaseAll directly to inner client", async () => {
    const inner = mockInner();
    const cached = new CachedGitClient(inner, disabledCache());

    await cached.releaseAll();

    expect(inner.releaseAll).toHaveBeenCalledOnce();
  });

  it("delegates destroy directly to inner client", async () => {
    const inner = mockInner();
    const cached = new CachedGitClient(inner, disabledCache());

    await cached.destroy();

    expect(inner.destroy).toHaveBeenCalledOnce();
  });

  // --- Cached method ---

  it("delegates logStats to inner client when cache is disabled", async () => {
    const inner = mockInner();
    const cached = new CachedGitClient(inner, disabledCache());
    const opts = { since: "2024-01-01T00:00:00Z" as const, until: "2024-06-01T00:00:00Z" as const };

    const result = await cached.logStats("backend", opts);

    expect(inner.logStats).toHaveBeenCalledWith("backend", opts);
    expect(result.linesAdded).toBe(500);
  });

  it("uses FileCache.getOrCompute for logStats caching", async () => {
    const inner = mockInner();
    const config: CacheConfig = { enabled: true, cacheDir: "/tmp/test-cache" };
    const cache = new FileCache(config);
    const spy = vi.spyOn(cache, "getOrCompute").mockResolvedValue(makeLogStats());

    const cached = new CachedGitClient(inner, cache);
    await cached.logStats("backend", { since: "2024-01-01T00:00:00Z" as const });

    expect(spy).toHaveBeenCalledOnce();
    expect(inner.logStats).not.toHaveBeenCalled();
  });
});
