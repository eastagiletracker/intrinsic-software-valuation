import type { StructuralFacts, HealthScores } from "@isv/domain";

import { buildCacheKey } from "../cache/cache-key.js";
import { FileCache } from "../cache/file-cache.js";

import type { StaticAnalysisClient } from "./client.js";

/**
 * Caching decorator for `StaticAnalysisClient`.
 *
 * Wraps an inner `StaticAnalysisClient` and caches `analyze()` results
 * as JSON files on disk.
 */
export class CachedStaticAnalysisClient implements StaticAnalysisClient {
  private readonly inner: StaticAnalysisClient;
  private readonly cache: FileCache;

  constructor(inner: StaticAnalysisClient, cache: FileCache) {
    this.inner = inner;
    this.cache = cache;
  }

  async analyze(
    directory: string,
  ): Promise<{ structuralFacts: StructuralFacts; healthScores: HealthScores }> {
    const key = buildCacheKey("static-analysis", "analyze", { directory });
    return this.cache.getOrCompute(key, () => this.inner.analyze(directory));
  }
}
