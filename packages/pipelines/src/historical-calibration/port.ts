import type { CalibrationRunOutput, Result } from "@isv/domain";

import type { CalibrationProgressCallback } from "./progress.js";

/**
 * Historical Calibration Pipeline port.
 *
 * Use Case 1: Batch calibration across historical tickets. Orchestrates
 * ticket clustering, T0 derivation, fact finding, gap analysis, valuation,
 * time attribution, and Ship Rate regression.
 */
export interface HistoricalCalibrationPipelinePort {
  /**
   * Run the full historical calibration pipeline.
   *
   * @param config - Pipeline configuration.
   * @returns CalibrationRunOutput with Ship Rate, R², DQS, sample size,
   *          per-cluster data, residuals, and skipped cluster reporting.
   */
  run(
    config: HistoricalCalibrationConfig,
  ): Promise<Result<CalibrationRunOutput>>;
}

/**
 * Configuration for the Historical Calibration Pipeline.
 */
export interface HistoricalCalibrationConfig {
  /** Project slug for scoping. Resolves to data/<projectSlug>/project-config.json. */
  projectSlug?: string;
  /** Start of calibration period (ISO month, e.g. "2025-10"). Defaults to 18 months before periodEnd. */
  periodStart?: string;
  /** End of calibration period (ISO month, e.g. "2026-02"). Defaults to current month. */
  periodEnd?: string;
  /** Project-level D3 quality floor. */
  d3QualityFloor?: 1 | 2 | 3;
  /** Minimum cluster confidence to include. */
  minConfidence?: number;
  /** Optional progress callback for live progress reporting. */
  onProgress?: CalibrationProgressCallback;
  /** Optional run ID for checkpoint/resume. When omitted, a timestamp-based ID is generated. */
  runId?: string;
  /** Maximum number of clusters processed concurrently. Default: 3. */
  concurrency?: number;
  /** Maximum concurrent LLM API calls across all workers. Default: 2. */
  llmConcurrency?: number;
  /** Per-task timeout in milliseconds. Default: 300 000 (5 min). */
  taskTimeoutMs?: number;
  /** Minimum cluster count for a cohort tier to become the primary calibration. Default: 18. */
  minCohortSampleSize?: number;
}
