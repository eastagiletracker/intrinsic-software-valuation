import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { IsoTimestamp, RepositoryRef, ServiceError } from "@isv/domain";
import { execa } from "execa";

import type {
  GitLogStats,
  GitPort,
  LogStatsOptions,
  PreparedRepo,
  WorkingTree,
} from "./port.js";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function gitError(
  code: string,
  message: string,
  context?: unknown,
): ServiceError {
  return { code, message, source: "git-client", context };
}

// ---------------------------------------------------------------------------
// Pure parsing helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Parse the first commit SHA from `git log --format=%H` output.
 * Returns `undefined` when the output is empty (no matching commit).
 */
export function parseCommitSha(output: string): string | undefined {
  const sha = output.trim().split("\n")[0]?.trim();
  return sha && /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined;
}

/**
 * Parse `git log --numstat` output into aggregated statistics.
 *
 * Each numstat line has the format: `<added>\t<deleted>\t<file>`
 * Binary files use `-` for added/deleted counts.
 */
export function parseLogStats(
  output: string,
  hotspotLimit: number = 10,
): GitLogStats {
  const lines = output.split("\n").filter((l) => /^\d+\t\d+\t/.test(l));

  let linesAdded = 0;
  let linesDeleted = 0;
  const fileCounts = new Map<string, number>();

  for (const line of lines) {
    const [addedStr, deletedStr, ...fileParts] = line.split("\t");
    const added = parseInt(addedStr, 10);
    const deleted = parseInt(deletedStr, 10);
    const file = fileParts.join("\t");

    if (isFinite(added)) linesAdded += added;
    if (isFinite(deleted)) linesDeleted += deleted;

    if (file) {
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
    }
  }

  const hotspots = Array.from(fileCounts.entries())
    .map(([file, changeCount]) => ({ file, changeCount }))
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, hotspotLimit);

  return {
    linesAdded,
    linesDeleted,
    filesChanged: fileCounts.size,
    hotspots,
  };
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Git worktree adapter.
 *
 * Implements `GitPort` using `execa` + `git` CLI with the bare-clone +
 * worktree strategy described in the module README.
 */
export class GitWorktreeAdapter implements GitPort {
  /**
   * Ensure a repository is available locally as a bare clone.
   *
   * - Remote URLs are cloned with `git clone --bare`.
   * - Local paths are validated to exist as directories.
   * - Idempotent: skips cloning if the bare directory already exists.
   */
  async prepare(ref: RepositoryRef, basePath: string): Promise<PreparedRepo> {
    await this.ensureGitAvailable();

    const reposDir = join(basePath, "repos");
    const repoPath = join(reposDir, `${ref.repositoryId}.git`);

    // Idempotent: skip if already prepared
    if (await this.dirExists(repoPath)) {
      return { repositoryId: ref.repositoryId, repoPath };
    }

    if (ref.url) {
      await mkdir(reposDir, { recursive: true });
      try {
        await execa("git", ["clone", "--bare", ref.url, repoPath]);
      } catch (err) {
        throw gitError(
          "GIT_CLONE_FAILED",
          `Failed to clone ${ref.url}: ${messageFrom(err)}`,
          err,
        );
      }
      return { repositoryId: ref.repositoryId, repoPath };
    }

    if (ref.localPath) {
      if (!(await this.dirExists(ref.localPath))) {
        throw gitError(
          "GIT_CLONE_FAILED",
          `Local path does not exist: ${ref.localPath}`,
        );
      }
      // For local paths, create a bare clone to enable worktrees
      await mkdir(reposDir, { recursive: true });
      try {
        await execa("git", ["clone", "--bare", ref.localPath, repoPath]);
      } catch (err) {
        throw gitError(
          "GIT_CLONE_FAILED",
          `Failed to clone local path ${ref.localPath}: ${messageFrom(err)}`,
          err,
        );
      }
      return { repositoryId: ref.repositoryId, repoPath };
    }

    throw gitError(
      "GIT_CLONE_FAILED",
      `RepositoryRef "${ref.repositoryId}" has neither url nor localPath`,
    );
  }

  /**
   * Create an isolated worktree at the last commit before the given timestamp.
   *
   * 1. Resolves the commit SHA via `git log --before=<T0> -1`.
   * 2. Creates a worktree at that SHA via `git worktree add --detach`.
   * 3. Returns a `WorkingTree` handle.
   *
   * If the checkout fails mid-operation, the partial worktree is cleaned up.
   */
  async checkout(
    repo: PreparedRepo,
    before: IsoTimestamp,
    workBasePath: string,
  ): Promise<WorkingTree> {
    // Resolve the last commit before the given timestamp
    let sha: string | undefined;
    try {
      const result = await execa(
        "git",
        ["log", "--all", "--format=%H", `--before=${before}`, "-1"],
        { cwd: repo.repoPath },
      );
      sha = parseCommitSha(result.stdout);
    } catch (err) {
      throw gitError(
        "GIT_LOG_FAILED",
        `Failed to resolve commit before ${before} in ${repo.repositoryId}: ${messageFrom(err)}`,
        err,
      );
    }

    if (!sha) {
      throw gitError(
        "COMMIT_NOT_FOUND",
        `No commit found before ${before} in repository "${repo.repositoryId}"`,
      );
    }

    // Create a worktree directory
    const shortSha = sha.slice(0, 8);
    const worktreeDir = join(
      workBasePath,
      `${repo.repositoryId}-${shortSha}`,
    );

    try {
      await mkdir(workBasePath, { recursive: true });

      // Prune stale worktree registrations (e.g. after manual rm -rf of work/)
      await execa("git", ["worktree", "prune"], { cwd: repo.repoPath }).catch(
        () => {},
      );

      // Clean up stale worktree from a previous interrupted run
      if (await this.dirExists(worktreeDir)) {
        await this.cleanupWorktree(repo.repoPath, worktreeDir);
      }

      await execa("git", ["worktree", "add", "--detach", worktreeDir, sha], {
        cwd: repo.repoPath,
      });
    } catch (err) {
      // Cleanup partial worktree on failure
      await this.cleanupWorktree(repo.repoPath, worktreeDir);
      throw gitError(
        "GIT_WORKTREE_FAILED",
        `Failed to create worktree for ${repo.repositoryId} at ${sha}: ${messageFrom(err)}`,
        err,
      );
    }

    return {
      repositoryId: repo.repositoryId,
      workingDir: worktreeDir,
      commitSha: sha,
    };
  }

  /**
   * Remove a worktree and clean up the temporary directory.
   */
  async release(tree: WorkingTree): Promise<void> {
    // Find the bare clone path by navigating from the worktree
    try {
      const result = await execa(
        "git",
        ["rev-parse", "--git-common-dir"],
        { cwd: tree.workingDir },
      );
      const bareRepoPath = result.stdout.trim();
      await execa("git", ["worktree", "remove", "--force", tree.workingDir], {
        cwd: bareRepoPath,
      });
    } catch {
      // Fallback: force-remove the directory if worktree remove fails
      await rm(tree.workingDir, { recursive: true, force: true });
    }
  }

  /**
   * Extract git log metrics for a time window.
   */
  async logStats(
    repo: PreparedRepo,
    opts: LogStatsOptions,
  ): Promise<GitLogStats> {
    const args = ["log", "--all", "--numstat", "--format="];

    if (opts.since) args.push(`--after=${opts.since}`);
    if (opts.until) args.push(`--before=${opts.until}`);

    try {
      const result = await execa("git", args, { cwd: repo.repoPath });
      return parseLogStats(result.stdout, opts.hotspotLimit ?? 10);
    } catch (err) {
      throw gitError(
        "GIT_LOG_FAILED",
        `Failed to extract log stats for ${repo.repositoryId}: ${messageFrom(err)}`,
        err,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async ensureGitAvailable(): Promise<void> {
    try {
      await execa("git", ["--version"]);
    } catch {
      throw gitError(
        "GIT_NOT_FOUND",
        "git CLI is not available on PATH. Please install Git.",
      );
    }
  }

  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const s = await stat(dirPath);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  private async cleanupWorktree(
    bareRepoPath: string,
    worktreeDir: string,
  ): Promise<void> {
    try {
      await execa("git", ["worktree", "remove", "--force", worktreeDir], {
        cwd: bareRepoPath,
      });
    } catch {
      // Best-effort: remove directory directly
      await rm(worktreeDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function messageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
