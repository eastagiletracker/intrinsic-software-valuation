import type { CacheConfig } from "@isv/clients";
import { FileCache } from "@isv/clients";

import { CachedGapAnalyzerService } from "./cached-gap-analyzer.js";
import type { GapAnalyzerPort } from "./port.js";
import { GapAnalyzerService } from "./service.js";

/**
 * Create a Gap Analyzer service instance.
 *
 * @param cacheConfig - Optional cache configuration. When provided with
 *   `enabled: true`, a caching decorator wraps the real analyzer so that
 *   repeated analyses for the same ticket + baseline skip the LLM call.
 * @returns A configured `GapAnalyzerPort`.
 */
export function createGapAnalyzer(
  cacheConfig?: CacheConfig,
): GapAnalyzerPort {
  const analyzer: GapAnalyzerPort = new GapAnalyzerService();

  if (cacheConfig?.enabled) {
    return new CachedGapAnalyzerService(
      analyzer,
      new FileCache(cacheConfig),
    );
  }
  return analyzer;
}
