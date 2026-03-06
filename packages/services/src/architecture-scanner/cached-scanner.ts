import {
  SystemContextSchema,
  type SystemContext,
  type Result,
  type ServiceError,
} from "@isv/domain";
import type { LlmClient } from "@isv/clients";
import { buildCacheKey, FileCache } from "@isv/clients";

import type { ArchitectureScannerPort } from "./port.js";

/**
 * Sentinel class used to distinguish inner-scanner errors from unexpected
 * exceptions inside `getOrCompute`.
 */
class ScannerError {
  constructor(readonly error: ServiceError) {}
}

/**
 * Caching decorator for `ArchitectureScannerPort`.
 *
 * Wraps an inner scanner and caches `scan()` results keyed by
 * `(repositoryId, commitSha)`. When `commitSha` is not provided,
 * the decorator falls through to the inner scanner without caching
 * (backwards-compatible behaviour).
 *
 * Cached values are validated against `SystemContextSchema` on read so
 * that stale entries from schema changes auto-miss.
 */
export class CachedArchitectureScannerService implements ArchitectureScannerPort {
  private readonly inner: ArchitectureScannerPort;
  private readonly cache: FileCache;

  constructor(inner: ArchitectureScannerPort, cache: FileCache) {
    this.inner = inner;
    this.cache = cache;
  }

  async scan(
    workingDir: string,
    llm: LlmClient,
    commitSha?: string,
  ): Promise<Result<SystemContext>> {
    // When commitSha is not provided, bypass caching entirely.
    if (!commitSha) {
      return this.inner.scan(workingDir, llm);
    }

    // Derive repositoryId from the directory name — must match the logic in
    // ArchitectureScannerService.scan() so the cache key is consistent.
    const repositoryId =
      workingDir.split("/").filter(Boolean).pop() ?? "unknown";

    const key = buildCacheKey("architecture-scanner", "scan", {
      repositoryId,
      commitSha,
    });

    try {
      const cached = await this.cache.getOrCompute<SystemContext>(
        key,
        async () => {
          const result = await this.inner.scan(workingDir, llm, commitSha);
          if (!result.success) {
            // Propagate the error — do NOT cache failures.
            throw new ScannerError(result.error);
          }
          return result.data;
        },
        SystemContextSchema,
      );

      return { success: true, data: cached };
    } catch (err) {
      if (err instanceof ScannerError) {
        return { success: false, error: err.error };
      }
      throw err;
    }
  }
}
