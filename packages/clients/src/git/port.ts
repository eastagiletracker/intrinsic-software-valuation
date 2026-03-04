import type { IsoTimestamp, RepositoryRef } from "@isv/domain";

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** Handle to a locally available repository (cloned or pre-existing). */
export interface PreparedRepo {
  readonly repositoryId: string;
  /** Path to the bare clone or validated local repo. */
  readonly repoPath: string;
}

/** Handle to an isolated working tree at a specific commit. */
export interface WorkingTree {
  readonly repositoryId: string;
  /** Absolute path to the checked-out working directory. */
  readonly workingDir: string;
  /** The exact commit SHA that is checked out. */
  readonly commitSha: string;
}

/** Options for extracting git log metrics. */
export interface LogStatsOptions {
  since?: IsoTimestamp;
  until?: IsoTimestamp;
  /** Maximum number of hotspot entries to return. Default: 10. */
  hotspotLimit?: number;
}

/** Aggregated git log metrics for a time window. */
export interface GitLogStats {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  hotspots: Array<{ file: string; changeCount: number }>;
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

/**
 * Low-level, single-repo Git CLI operations.
 *
 * The port abstracts bare clone management, worktree lifecycle, and log
 * statistics extraction. It is consumed exclusively by the `GitClient`
 * implementation — services never use `GitPort` directly.
 */
export interface GitPort {
  /** Ensure a single repo is available locally (bare clone or reuse). */
  prepare(ref: RepositoryRef, basePath: string): Promise<PreparedRepo>;

  /** Create an isolated worktree at the last commit before the given timestamp. */
  checkout(
    repo: PreparedRepo,
    before: IsoTimestamp,
    workBasePath: string,
  ): Promise<WorkingTree>;

  /** Remove the worktree and clean up the temporary directory. */
  release(tree: WorkingTree): Promise<void>;

  /** Extract git log metrics for a time window. */
  logStats(repo: PreparedRepo, opts: LogStatsOptions): Promise<GitLogStats>;
}
