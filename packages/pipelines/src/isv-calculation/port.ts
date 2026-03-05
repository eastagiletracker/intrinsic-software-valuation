import type { Result } from "@isv/domain";

import type { EnrichedIsvResult } from "./enriched-result.js";

// ---------------------------------------------------------------------------
// Pipeline progress event types
// ---------------------------------------------------------------------------

/** Identifiers for each discrete pipeline step. */
export type PipelineStepId =
  | "ticket-fetched"
  | "repos-checked-out"
  | "code-health-mined"
  | "architecture-scanned"
  | "c2-derived"
  | "gap-analyzed"
  | "factors-assembled"
  | "isv-calculated";

/** Progress event emitted by the pipeline at each step boundary. */
export interface PipelineProgressEvent {
  step: PipelineStepId;
  completedSteps: number;
  totalSteps: number;
  /** Partial result payload — shape depends on step. */
  data?: unknown;
  /** Human-readable detail for sub-progress (e.g. "repo 2 of 3"). */
  detail?: string;
}

/** Callback type for progress observers. */
export type PipelineProgressCallback = (event: PipelineProgressEvent) => void;

// ---------------------------------------------------------------------------
// Pipeline port
// ---------------------------------------------------------------------------

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
   * @param onProgress - Optional callback for progress events.
   * @param signal - Optional abort signal to cancel a running pipeline.
   * @returns The enriched result with ticket, pipeline intermediates, ISV result, and calibration.
   */
  run(
    ticketId: string,
    config: IsvCalculationConfig,
    onProgress?: PipelineProgressCallback,
    signal?: AbortSignal,
  ): Promise<Result<EnrichedIsvResult>>;
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
