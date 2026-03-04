import type { StaticAnalysisClient, GitClient } from "@isv/clients";

import type { StatusQuoMinerPort } from "./port.js";
import { StatusQuoMinerService } from "./service.js";

/**
 * Create a Status Quo Miner service instance.
 *
 * @param staticAnalysis - Static analysis client for code metrics.
 * @param gitClient - Optional Git client for hotspot extraction.
 * @returns A configured `StatusQuoMinerPort`.
 */
export function createStatusQuoMiner(
  staticAnalysis: StaticAnalysisClient,
  gitClient?: GitClient,
): StatusQuoMinerPort {
  return new StatusQuoMinerService(staticAnalysis, gitClient);
}
