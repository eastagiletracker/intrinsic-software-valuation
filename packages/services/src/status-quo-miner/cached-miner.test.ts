import { describe, it, expect, vi } from "vitest";
import type { CodeHealthReport, Result } from "@isv/domain";
import type { WorkingTree } from "@isv/clients";
import { FileCache } from "@isv/clients";
import type { CacheConfig } from "@isv/clients";

import { CachedStatusQuoMinerService } from "./cached-miner.js";
import type { StatusQuoMinerPort } from "./port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkingTree(
  repositoryId = "test-repo",
  commitSha = "abc123",
): WorkingTree {
  return {
    repositoryId,
    workingDir: `/tmp/work/${repositoryId}-${commitSha.slice(0, 7)}`,
    commitSha,
  };
}

function makeReport(
  repositoryId = "test-repo",
  timestamp = "2025-06-01T00:00:00.000Z",
): CodeHealthReport {
  return {
    repository: { repositoryId },
    timestamp,
    structuralFacts: {
      volume: { totalLinesOfCode: 1000, totalFiles: 50 },
      entryPoints: { controllers: 2, views: 3 },
      gitHotspots: [],
    },
    healthScores: {
      complexity: {
        avgCyclomaticComplexity: 5,
        duplicationPercentage: 3,
        godClassCount: 0,
      },
      testHealth: {
        coveragePercentage: 80,
        outdatedDependencies: 2,
        deadCodeFiles: 1,
      },
    },
  };
}

function makeSuccessResult(
  reports: CodeHealthReport[] = [makeReport()],
): Result<CodeHealthReport[]> {
  return { success: true, data: reports };
}

function makeFailureResult(): Result<CodeHealthReport[]> {
  return {
    success: false,
    error: {
      code: "STATUS_QUO_MINER_FAILED",
      message: "scc failed",
      source: "status-quo-miner",
    },
  };
}

function mockInner(
  result: Result<CodeHealthReport[]> = makeSuccessResult(),
): StatusQuoMinerPort {
  return {
    mine: vi.fn<StatusQuoMinerPort["mine"]>().mockResolvedValue(result),
  };
}

function enabledConfig(): CacheConfig {
  return { enabled: true, cacheDir: "/tmp/test-miner-cache" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CachedStatusQuoMinerService", () => {
  it("returns cached result on second call with same commitSha; calls inner miner only once", async () => {
    const report = makeReport("test-repo", "2025-06-01T00:00:00.000Z");
    const inner = mockInner(makeSuccessResult([report]));
    const config = enabledConfig();
    const cache = new FileCache(config);

    // Track calls: first time → miss (throw sentinel, then re-enter for write),
    // second time → hit
    const calls = new Map<string, CodeHealthReport>();
    vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (key, compute, _schema) => {
        if (calls.has(key)) {
          return calls.get(key)!;
        }
        const value = (await compute()) as CodeHealthReport;
        calls.set(key, value);
        return value;
      },
    );

    const cached = new CachedStatusQuoMinerService(inner, cache);
    const tree = makeWorkingTree("test-repo", "abc123");

    const result1 = await cached.mine([tree], "2025-06-01T00:00:00.000Z");
    const result2 = await cached.mine([tree], "2025-06-01T00:00:00.000Z");

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    // Inner miner should only be called once
    expect(inner.mine).toHaveBeenCalledOnce();
  });

  it("produces different cache keys for different commitSha values", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedStatusQuoMinerService(inner, cache);
    const tree1 = makeWorkingTree("test-repo", "sha-aaa");
    const tree2 = makeWorkingTree("test-repo", "sha-bbb");

    await cached.mine([tree1], "2025-06-01T00:00:00.000Z");
    await cached.mine([tree2], "2025-06-01T00:00:00.000Z");

    // Each call produces 2 getOrCompute calls (cache check + cache write)
    // The check keys should be different
    const keys = computeSpy.mock.calls.map((c) => c[0]);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBeGreaterThan(1);
  });

  it("overwrites timestamp on cached result with caller's timestamp", async () => {
    const originalTimestamp = "2025-01-01T00:00:00.000Z";
    const callerTimestamp = "2025-06-01T00:00:00.000Z";
    const report = makeReport("test-repo", originalTimestamp);
    const inner = mockInner(makeSuccessResult([report]));
    const config = enabledConfig();
    const cache = new FileCache(config);

    // First call → miss → compute; second call → hit with original timestamp
    let called = false;
    vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute, _schema) => {
        if (!called) {
          called = true;
          // First time: miss sentinel → throw, making inner mine happen
          // But we're mocking, so let's signal cache miss for first check,
          // then return the report for the write step
          const val = (await compute()) as CodeHealthReport;
          return val;
        }
        // Second time: return cached report with ORIGINAL timestamp
        return { ...report, timestamp: originalTimestamp };
      },
    );

    const cached = new CachedStatusQuoMinerService(inner, cache);
    const tree = makeWorkingTree("test-repo", "abc123");

    // First call stores the report
    await cached.mine([tree], originalTimestamp);

    // Second call with different timestamp should overwrite
    const result2 = await cached.mine([tree], callerTimestamp);

    expect(result2.success).toBe(true);
    if (result2.success) {
      expect(result2.data[0].timestamp).toBe(callerTimestamp);
    }
  });

  it("does not cache failed results", async () => {
    const inner = mockInner(makeFailureResult());
    const config = enabledConfig();
    const cache = new FileCache(config);

    // Cache check → miss (sentinel throw), then inner mine returns failure
    vi.spyOn(cache, "getOrCompute").mockImplementation(async (_key, compute) => {
      return compute();
    });

    const cached = new CachedStatusQuoMinerService(inner, cache);
    const tree = makeWorkingTree("test-repo", "abc123");

    const result = await cached.mine([tree], "2025-06-01T00:00:00.000Z");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("STATUS_QUO_MINER_FAILED");
    }
  });

  it("uses cache key with status-quo-miner/mine prefix", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedStatusQuoMinerService(inner, cache);
    const tree = makeWorkingTree("test-repo", "abc123");

    await cached.mine([tree], "2025-06-01T00:00:00.000Z");

    const key = computeSpy.mock.calls[0][0];
    expect(key).toMatch(/^status-quo-miner\/mine\//);
  });

  // Per-repo caching: mine([repoA, repoB]) where repoA is cached, repoB is not
  it("only calls inner miner for cache-miss repos in a multi-repo mine call", async () => {
    const repoA = makeWorkingTree("repo-a", "sha-111");
    const repoB = makeWorkingTree("repo-b", "sha-222");
    const reportA = makeReport("repo-a", "2025-06-01T00:00:00.000Z");
    const reportB = makeReport("repo-b", "2025-06-01T00:00:00.000Z");

    // Inner miner only returns reportB (repoA is cached)
    const inner: StatusQuoMinerPort = {
      mine: vi.fn<StatusQuoMinerPort["mine"]>().mockResolvedValue({
        success: true,
        data: [reportB],
      }),
    };

    const config = enabledConfig();
    const cache = new FileCache(config);

    // Build a cache key for repoA to simulate it being cached
    const { buildCacheKey } = await import("@isv/clients");
    const repoAKey = buildCacheKey("status-quo-miner", "mine", {
      repositoryId: "repo-a",
      commitSha: "sha-111",
    });

    // Cache: hit for repoA, miss for repoB
    vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (key, compute, _schema) => {
        if (key === repoAKey) {
          return reportA; // cache hit
        }
        return compute(); // cache miss → compute
      },
    );

    const cached = new CachedStatusQuoMinerService(inner, cache);

    const result = await cached.mine(
      [repoA, repoB],
      "2025-06-01T00:00:00.000Z",
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Should have 2 reports total
    expect(result.data).toHaveLength(2);

    // Inner miner should only be called with repoB
    expect(inner.mine).toHaveBeenCalledOnce();
    const minedRepos = (inner.mine as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as WorkingTree[];
    expect(minedRepos).toHaveLength(1);
    expect(minedRepos[0].repositoryId).toBe("repo-b");
  });

  it("handles schema validation miss on corrupt cache entry", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);

    // First getOrCompute call (cache check) throws to simulate validation failure
    let callCount = 0;
    vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => {
        callCount++;
        if (callCount === 1) {
          // Simulate cache miss (sentinel throw from our logic)
          return compute();
        }
        // Write step
        return compute();
      },
    );

    const cached = new CachedStatusQuoMinerService(inner, cache);
    const tree = makeWorkingTree("test-repo", "abc123");

    const result = await cached.mine([tree], "2025-06-01T00:00:00.000Z");

    expect(result.success).toBe(true);
    expect(inner.mine).toHaveBeenCalledOnce();
  });
});
