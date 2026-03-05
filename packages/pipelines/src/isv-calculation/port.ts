import type { Result } from "@isv/domain";

import type { EnrichedIsvResult } from "./enriched-result.js";

/**
 * ISV Calculation Pipeline port.
 *
 * Use Case 2: Single-ticket ISV calculation. Orchestrates all services
 * from ticket retrieval through fact finding, gap analysis, and valuation
 * to produce a final IsvResult with all intermediate outputs.
 */
export interface IsvCalculationPipelinePort {
  /**
   * Run the full ISV calculation pipeline for a single ticket.
   *
   * @param ticketId - The ticket to calculate ISV for.
   * @param config - Pipeline configuration.
   * @returns The enriched result with ticket, pipeline intermediates, ISV result, and calibration.
   */
  run(ticketId: string, config: IsvCalculationConfig): Promise<Result<EnrichedIsvResult>>;
}

/**
 * Configuration for the ISV Calculation Pipeline.
 */
export interface IsvCalculationConfig {
  /** Project-level configuration (D3 quality floor, etc). */
  d3QualityFloor?: 1 | 2 | 3;
  /** Repository IDs to analyze (if different from all managed repos). */
  repositoryIds?: string[];
}
