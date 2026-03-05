import type { TimeSheet } from "@isv/domain";

import { buildCacheKey } from "../cache/cache-key.js";
import { FileCache } from "../cache/file-cache.js";

import type { TimeTrackingClient } from "./client.js";
import type { TimeTrackingQuery } from "./query.schema.js";

/**
 * Caching decorator for `TimeTrackingClient`.
 *
 * Wraps an inner `TimeTrackingClient` and caches `getTimeSheet()` results
 * as JSON files on disk.
 */
export class CachedTimeTrackingClient implements TimeTrackingClient {
  private readonly inner: TimeTrackingClient;
  private readonly cache: FileCache;

  constructor(inner: TimeTrackingClient, cache: FileCache) {
    this.inner = inner;
    this.cache = cache;
  }

  async getTimeSheet(query?: TimeTrackingQuery): Promise<TimeSheet> {
    const key = buildCacheKey(
      "time-tracking",
      "getTimeSheet",
      queryToParams(query),
    );
    return this.cache.getOrCompute(key, () =>
      this.inner.getTimeSheet(query),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function queryToParams(query?: TimeTrackingQuery): Record<string, unknown> {
  if (!query) return {};
  return { ...query };
}
