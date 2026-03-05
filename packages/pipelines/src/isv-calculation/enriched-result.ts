import type {
  Ticket,
  IsvResult,
  GapAnalysisResult,
  C2State,
  CodeHealthReport,
  SystemContext,
} from "@isv/domain";

// ---------------------------------------------------------------------------
// Per-repository pipeline output
// ---------------------------------------------------------------------------

/** Commit provenance captured from the working tree at analysis time. */
export interface CommitProvenance {
  commitSha: string;
  commitDate: string;
}

/** Pipeline output for a single repository. */
export interface RepositoryPipelineResult {
  repositoryId: string;
  codeHealthReport: CodeHealthReport;
  systemContext: SystemContext;
  c2State: C2State | undefined;
  provenance: CommitProvenance;
}

// ---------------------------------------------------------------------------
// Aggregated pipeline results (intermediate outputs)
// ---------------------------------------------------------------------------

/** All intermediate pipeline outputs grouped for the response. */
export interface PipelineResults {
  repositories: RepositoryPipelineResult[];
  effectiveC2: C2State;
  gapAnalysis: GapAnalysisResult;
}

// ---------------------------------------------------------------------------
// Calibration context
// ---------------------------------------------------------------------------

/** Optional calibration context data for plausibility assessment. */
export interface CalibrationContext {
  storyPoints?: number;
  trackedHours?: number;
  gitChanges?: {
    linesAdded: number;
    linesDeleted: number;
    filesChanged: number;
  };
  plausibilityNarrative?: string;
}

// ---------------------------------------------------------------------------
// Enriched result
// ---------------------------------------------------------------------------

/**
 * Enriched ISV calculation result carrying all intermediate pipeline outputs
 * alongside the final IsvResult.
 *
 * This is the primary response type returned by the pipeline and served
 * by the `/api/calculate` endpoint.
 */
export interface EnrichedIsvResult {
  ticket: Ticket;
  pipelineResults: PipelineResults;
  isvResult: IsvResult;
  calibration: CalibrationContext;
}
