import type {
  CodeHealthReport,
  IsoTimestamp,
  Result,
  ServiceError,
} from "@isv/domain";
import { CodeHealthReportSchema } from "@isv/domain";
import type { WorkingTree } from "@isv/clients";
import { buildCacheKey, FileCache } from "@isv/clients";

import type { StatusQuoMinerPort } from "./port.js";

/**
 * Sentinel class used to distinguish inner-miner errors from unexpected
 * exceptions inside `getOrCompute`.
 */
class MinerError {
  constructor(readonly error: ServiceError) {}
}

/**
 * Caching decorator for `StatusQuoMinerPort`.
 *
 * Wraps an inner miner and caches `mine()` results **per repository**,
 * keyed by `(repositoryId, commitSha)`. When a repo's result is already
 * cached, the expensive static analysis tools are skipped for that repo.
 *
 * Per-repo granularity maximises cache hit rates: if repo A changed but
 * repo B stayed on the same SHA, repo B's cached result is reused.
 *
 * Cached values are validated against `CodeHealthReportSchema` on read so
 * that stale entries from schema changes auto-miss.
 *
 * The `timestamp` field is overwritten after cache read because the same
 * code state may be queried at different logical T0 times.
 */
export class CachedStatusQuoMinerService implements StatusQuoMinerPort {
  private readonly inner: StatusQuoMinerPort;
  private readonly cache: FileCache;

  constructor(inner: StatusQuoMinerPort, cache: FileCache) {
    this.inner = inner;
    this.cache = cache;
  }

  async mine(
    repos: WorkingTree[],
    timestamp: IsoTimestamp,
  ): Promise<Result<CodeHealthReport[]>> {
    const cached: CodeHealthReport[] = [];
    const uncached: WorkingTree[] = [];

    // Phase 1: Check cache for each repo individually
    for (const repo of repos) {
      const key = buildCacheKey("status-quo-miner", "mine", {
        repositoryId: repo.repositoryId,
        commitSha: repo.commitSha,
      });

      try {
        const hit = await this.cache.getOrCompute<CodeHealthReport>(
          key,
          // Throw a sentinel to signal cache miss without computing here
          () => {
            throw new MinerError({
              code: "CACHE_MISS",
              message: "sentinel",
              source: "cached-miner",
            });
          },
          CodeHealthReportSchema,
        );
        // Cache hit — overwrite timestamp to match the caller's T0
        cached.push({ ...hit, timestamp });
      } catch (err) {
        if (err instanceof MinerError && err.error.code === "CACHE_MISS") {
          // Expected: no cache entry → mine this repo
          uncached.push(repo);
        } else {
          // Unexpected error from FileCache itself → mine this repo
          uncached.push(repo);
        }
      }
    }

    // Phase 2: Mine uncached repos (if any)
    if (uncached.length > 0) {
      const result = await this.inner.mine(uncached, timestamp);
      if (!result.success) {
        // If the inner miner fails, return the error (don't cache failures)
        return result;
      }

      // Phase 3: Cache successful results
      for (const report of result.data) {
        const repo = uncached.find(
          (r) => r.repositoryId === report.repository.repositoryId,
        );
        if (repo) {
          const key = buildCacheKey("status-quo-miner", "mine", {
            repositoryId: repo.repositoryId,
            commitSha: repo.commitSha,
          });
          // Write to cache (fire-and-forget errors — cache write failure is non-fatal)
          try {
            await this.cache.getOrCompute(
              key,
              () => Promise.resolve(report),
              CodeHealthReportSchema,
            );
          } catch {
            // Cache write failure is non-fatal
          }
        }
        cached.push(report);
      }
    }

    return { success: true, data: cached };
  }
}
