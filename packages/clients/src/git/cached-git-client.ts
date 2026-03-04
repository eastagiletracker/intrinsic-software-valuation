import type { IsoTimestamp } from "@isv/domain";

import { buildCacheKey } from "../cache/cache-key.js";
import { FileCache } from "../cache/file-cache.js";

import type { GitClient } from "./client.js";
import type { GitLogStats, LogStatsOptions, WorkingTree } from "./port.js";

/**
 * Caching decorator for `GitClient`.
 *
 * Only `logStats()` results are cached. Lifecycle methods (`checkout`,
 * `checkoutAll`, `release`, `releaseAll`, `destroy`) and the synchronous
 * `repositoryIds()` delegate directly to the inner client without caching.
 */
export class CachedGitClient implements GitClient {
  private readonly inner: GitClient;
  private readonly cache: FileCache;

  constructor(inner: GitClient, cache: FileCache) {
    this.inner = inner;
    this.cache = cache;
  }

  // --- Pass-through (not cached) ---

  repositoryIds(): string[] {
    return this.inner.repositoryIds();
  }

  checkoutAll(before: IsoTimestamp): Promise<Map<string, WorkingTree>> {
    return this.inner.checkoutAll(before);
  }

  checkout(
    repositoryId: string,
    before: IsoTimestamp,
  ): Promise<WorkingTree> {
    return this.inner.checkout(repositoryId, before);
  }

  release(tree: WorkingTree): Promise<void> {
    return this.inner.release(tree);
  }

  releaseAll(): Promise<void> {
    return this.inner.releaseAll();
  }

  destroy(): Promise<void> {
    return this.inner.destroy();
  }

  // --- Cached ---

  async logStats(
    repositoryId: string,
    opts: LogStatsOptions,
  ): Promise<GitLogStats> {
    const key = buildCacheKey("git", "logStats", {
      repositoryId,
      ...opts,
    });
    return this.cache.getOrCompute(key, () =>
      this.inner.logStats(repositoryId, opts),
    );
  }
}
