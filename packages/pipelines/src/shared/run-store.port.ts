import type { CalibrationRunOutput, ShipUnitCluster } from "@isv/domain";

// ---------------------------------------------------------------------------
// Status types
// ---------------------------------------------------------------------------

/** Status of a calibration run. */
export type RunStatus = "pending" | "running" | "completed" | "failed";

/** Status of a single cluster within a run. */
export type ClusterStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "skipped";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Serialised configuration stored alongside the run. */
export interface RunConfig {
  projectSlug?: string;
  periodStart?: string;
  periodEnd?: string;
  concurrency?: number;
  llmConcurrency?: number;
  [key: string]: unknown;
}

/** A single calibration run record. */
export interface RunRecord {
  runId: string;
  projectSlug: string;
  config: RunConfig;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  result?: CalibrationRunOutput;
}

/** A single cluster record within a run. */
export interface ClusterRecord {
  clusterId: string;
  runId: string;
  status: ClusterStatus;
  retryCount: number;
  data?: ShipUnitCluster;
  error?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

/**
 * Persistence port for calibration run and cluster state.
 *
 * Implementations may use SQLite, in-memory maps, or any other storage.
 * Placed in `@isv/pipelines` because it stores pipeline-internal
 * orchestration state, not external system data.
 */
export interface RunStore {
  /** Create a new run record. */
  createRun(config: RunConfig): RunRecord;

  /** Retrieve a run by its ID. */
  getRun(runId: string): RunRecord | undefined;

  /** Update the status of a run. */
  updateRunStatus(runId: string, status: RunStatus): void;

  /** Mark a run as completed and persist its full output. */
  completeRun(runId: string, result: CalibrationRunOutput): void;

  /** Bulk-create cluster records for a run (all start as `'pending'`). */
  createClusters(runId: string, clusterIds: string[]): void;

  /** Update a single cluster's status and optional data. */
  updateCluster(
    runId: string,
    clusterId: string,
    status: ClusterStatus,
    data?: ShipUnitCluster,
    error?: string,
  ): void;

  /** Retrieve a single cluster record. */
  getCluster(runId: string, clusterId: string): ClusterRecord | undefined;

  /** List clusters filtered by status. */
  getClustersByStatus(runId: string, status: ClusterStatus): ClusterRecord[];

  /** List all runs (newest first). */
  listRuns(): RunRecord[];

  /** Close the store and release any resources. */
  close(): void;
}
