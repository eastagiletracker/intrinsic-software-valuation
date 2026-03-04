import type { CodeHealthReport, IsoTimestamp, Result } from "@isv/domain";
import type { WorkingTree } from "@isv/clients";

/**
 * Status Quo Miner service port.
 *
 * Phase 1 (quantitative): collects deterministic code health metrics
 * from checked-out repositories using static analysis tools and Git
 * history.
 */
export interface StatusQuoMinerPort {
  /**
   * Mine code health metrics for one or more repositories.
   *
   * @param repos - Working trees already checked out at the target timestamp.
   * @param timestamp - The T0 baseline timestamp for the report.
   * @returns An array of CodeHealthReport — one per repository.
   */
  mine(
    repos: WorkingTree[],
    timestamp: IsoTimestamp,
  ): Promise<Result<CodeHealthReport[]>>;
}
