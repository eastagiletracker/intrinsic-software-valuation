import type { IsvResult, Result } from "@isv/domain";

/**
 * ISV Calculation Pipeline port.
 *
 * Use Case 2: Single-ticket ISV calculation. Orchestrates all services
 * from ticket retrieval through fact finding, gap analysis, and valuation
 * to produce a final IsvResult.
 */
export interface IsvCalculationPipelinePort {
  /**
   * Run the full ISV calculation pipeline for a single ticket.
   *
   * @param ticketId - The ticket to calculate ISV for.
   * @param config - Pipeline configuration.
   * @returns The complete IsvResult with formula version, factors, breakdown, and score.
   */
  run(ticketId: string, config: IsvCalculationConfig): Promise<Result<IsvResult>>;
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
