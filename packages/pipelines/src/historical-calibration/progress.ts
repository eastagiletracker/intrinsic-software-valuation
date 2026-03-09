// ---------------------------------------------------------------------------
// Calibration pipeline progress event types
// ---------------------------------------------------------------------------

/** Identifiers for each discrete calibration pipeline phase. */
export type CalibrationPhaseId =
  | "loading-tickets"
  | "clustering"
  | "loading-time-entries"
  | "attributing-time"
  | "calculating-dqs"
  | "processing-cluster"
  | "regression"
  | "generating-summary"
  | "complete";

/** Progress event emitted by the calibration pipeline. */
export interface CalibrationProgressEvent {
  phase: CalibrationPhaseId;
  current: number;
  total: number;
  clusterId?: string;
  status?: "processing" | "completed" | "skipped" | "restored" | "retrying" | "failed" | "cache-hit";
  detail?: string;
}

/** Callback type for calibration progress observers. */
export type CalibrationProgressCallback = (
  event: CalibrationProgressEvent,
) => void;
