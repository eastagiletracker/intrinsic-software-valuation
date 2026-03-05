import type { StructuralFacts, HealthScores } from "@isv/domain";
import { describe, expect, it, vi } from "vitest";

import { FileCache } from "../cache/file-cache.js";
import type { CacheConfig } from "../cache/cache-config.schema.js";

import { CachedStaticAnalysisClient } from "./cached-static-analysis-client.js";
import type { StaticAnalysisClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(): {
  structuralFacts: StructuralFacts;
  healthScores: HealthScores;
} {
  return {
    structuralFacts: {
      volume: { totalLinesOfCode: 10_000, totalFiles: 50 },
      entryPoints: { controllers: 5, views: 10 },
      gitHotspots: [],
    },
    healthScores: {
      complexity: {
        avgCyclomaticComplexity: 3.5,
        duplicationPercentage: 2.1,
        godClassCount: 0,
      },
      testHealth: {
        coveragePercentage: undefined,
        outdatedDependencies: 0,
        deadCodeFiles: 1,
      },
    },
  };
}

function mockInner(): StaticAnalysisClient {
  return {
    analyze: vi.fn<StaticAnalysisClient["analyze"]>().mockResolvedValue(makeResult()),
  };
}

function disabledCache(): FileCache {
  return new FileCache({ enabled: false, cacheDir: "/tmp/unused" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CachedStaticAnalysisClient", () => {
  it("delegates analyze to inner client when cache is disabled", async () => {
    const inner = mockInner();
    const cached = new CachedStaticAnalysisClient(inner, disabledCache());

    const result = await cached.analyze("/test/repo");

    expect(inner.analyze).toHaveBeenCalledWith("/test/repo");
    expect(result.structuralFacts).toBeDefined();
    expect(result.healthScores).toBeDefined();
  });

  it("returns inner client result", async () => {
    const expected = makeResult();
    const inner: StaticAnalysisClient = {
      analyze: vi.fn<StaticAnalysisClient["analyze"]>().mockResolvedValue(expected),
    };
    const cached = new CachedStaticAnalysisClient(inner, disabledCache());

    const result = await cached.analyze("/test/repo");
    expect(result).toEqual(expected);
  });

  it("uses FileCache.getOrCompute for caching", async () => {
    const inner = mockInner();
    const config: CacheConfig = { enabled: true, cacheDir: "/tmp/test-cache" };
    const cache = new FileCache(config);
    const spy = vi.spyOn(cache, "getOrCompute").mockResolvedValue(makeResult());

    const cached = new CachedStaticAnalysisClient(inner, cache);
    await cached.analyze("/test/repo");

    expect(spy).toHaveBeenCalledOnce();
    expect(inner.analyze).not.toHaveBeenCalled();
  });
});
