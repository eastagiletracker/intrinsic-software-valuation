import type { IsoTimestamp } from "@isv/domain";

import type { GitLogStats, LogStatsOptions, WorkingTree } from "./port.js";

/**
 * High-level, multi-repo Git client interface.
 *
 * Manages a pool of repositories — cloning, time-travel checkouts via
 * worktrees, log statistics, and cleanup. Services interact with
 * checked-out source code through opaque directory paths without knowing
 * about clones, worktrees, or the `git` CLI.
 */
export interface GitClient {
  /** List all managed repository IDs. */
  repositoryIds(): string[];

  /** Time-travel: checkout all repos at a timestamp, returns a map of working trees. */
  checkoutAll(before: IsoTimestamp): Promise<Map<string, WorkingTree>>;

  /** Time-travel: checkout a single repo by ID. */
  checkout(repositoryId: string, before: IsoTimestamp): Promise<WorkingTree>;

  /** Release a single worktree. */
  release(tree: WorkingTree): Promise<void>;

  /** Release all active worktrees. */
  releaseAll(): Promise<void>;

  /** Git log metrics for a single repo. */
  logStats(repositoryId: string, opts: LogStatsOptions): Promise<GitLogStats>;

  /** Tear down everything: remove all worktrees and bare clones. */
  destroy(): Promise<void>;
}
