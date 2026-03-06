import type { StaticAnalysisClient, GitClient, CacheConfig } from "@isv/clients";
import { FileCache } from "@isv/clients";

import { CachedStatusQuoMinerService } from "./cached-miner.js";
import type { StatusQuoMinerPort } from "./port.js";
import { StatusQuoMinerService } from "./service.js";

/**
 * Create a Status Quo Miner service instance.
 *
 * @param staticAnalysis - Static analysis client for code metrics.
 * @param gitClient - Optional Git client for hotspot extraction.
 * @param cacheConfig - Optional cache configuration. When provided with
 *   `enabled: true`, a caching decorator wraps the real miner so that
 *   repeated mines for the same `(repositoryId, commitSha)` pair skip
 *   the static analysis tools.
 * @returns A configured `StatusQuoMinerPort`.
 */
export function createStatusQuoMiner(
  staticAnalysis: StaticAnalysisClient,
  gitClient?: GitClient,
  cacheConfig?: CacheConfig,
): StatusQuoMinerPort {
  const miner: StatusQuoMinerPort = new StatusQuoMinerService(
    staticAnalysis,
    gitClient,
  );

  if (cacheConfig?.enabled) {
    return new CachedStatusQuoMinerService(
      miner,
      new FileCache(cacheConfig),
    );
  }
  return miner;
}
