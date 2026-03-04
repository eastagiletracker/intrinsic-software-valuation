import type { Result, Ticket } from "@isv/domain";

import { buildCacheKey } from "../cache/cache-key.js";
import { FileCache } from "../cache/file-cache.js";

import type { TicketClient } from "./client.js";
import type { TicketQuery } from "./query.schema.js";

/**
 * Caching decorator for `TicketClient`.
 *
 * Wraps an inner `TicketClient` and caches `getTickets()` results as
 * JSON files on disk. Cache hits return parsed JSON without calling
 * the inner client; cache misses delegate to the real implementation,
 * store the result, and return it.
 */
export class CachedTicketClient implements TicketClient {
  private readonly inner: TicketClient;
  private readonly cache: FileCache;

  constructor(inner: TicketClient, cache: FileCache) {
    this.inner = inner;
    this.cache = cache;
  }

  async getTickets(query?: TicketQuery): Promise<Result<Ticket[]>> {
    const key = buildCacheKey("jira", "getTickets", queryToParams(query));
    return this.cache.getOrCompute(key, () => this.inner.getTickets(query));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function queryToParams(query?: TicketQuery): Record<string, unknown> {
  if (!query) return {};
  return { ...query };
}
