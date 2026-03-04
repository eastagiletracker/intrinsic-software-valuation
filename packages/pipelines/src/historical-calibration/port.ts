import type { CalibrationResult, Result } from "@isv/domain";

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
   * @returns CalibrationResult with Ship Rate, R², DQS, and sample size.
   */
  run(config: HistoricalCalibrationConfig): Promise<Result<CalibrationResult>>;
}

/**
 * Configuration for the Historical Calibration Pipeline.
 */
export interface HistoricalCalibrationConfig {
  /** Project-level D3 quality floor. */
  d3QualityFloor?: 1 | 2 | 3;
  /** Minimum cluster confidence to include. */
  minConfidence?: number;
}
