import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { IsoTimestamp, RepositoryRef } from "@isv/domain";
import { ServiceException } from "@isv/domain";
import { execa } from "execa";

import type {
  GitLogStats,
  GitPort,
  LogStatsOptions,
  PreparedRepo,
  WorkingTree,
} from "./port.js";
import { AsyncMutex } from "./async-mutex.js";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function gitError(
  code: string,
  message: string,
  context?: unknown,
): ServiceException {
  return new ServiceException(code, message, "git-client", context);
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
  /** Per-repo mutexes: serializes checkout/release on the same bare repo. */
  private readonly repoLocks = new Map<string, AsyncMutex>();

  private lockFor(repoPath: string): AsyncMutex {
    let lock = this.repoLocks.get(repoPath);
    if (!lock) {
      lock = new AsyncMutex();
      this.repoLocks.set(repoPath, lock);
    }
    return lock;
  }

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

    // Create a worktree directory with a unique suffix to prevent collisions
    // when multiple concurrent clusters resolve to the same commit.
    const shortSha = sha.slice(0, 8);
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const worktreeDir = join(
      workBasePath,
      `${repo.repositoryId}-${shortSha}-${uniqueSuffix}`,
    );

    // Serialize prune + add for the same bare repo to prevent race conditions.
    return this.lockFor(repo.repoPath).run(async () => {
      try {
        await mkdir(workBasePath, { recursive: true });

        // Prune stale worktree registrations (e.g. after manual rm -rf of work/)
        await execa("git", ["worktree", "prune"], { cwd: repo.repoPath }).catch(
          () => {},
        );

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
        commitSha: sha!,
      };
    });
  }

  /**
   * Resolve the commit SHA at a given timestamp without creating a worktree.
   * Returns `undefined` when no commit exists before the timestamp.
   */
  async resolveCommitSha(
    repo: PreparedRepo,
    before: IsoTimestamp,
  ): Promise<string | undefined> {
    try {
      const result = await execa(
        "git",
        ["log", "--all", "--format=%H", `--before=${before}`, "-1"],
        { cwd: repo.repoPath },
      );
      return parseCommitSha(result.stdout);
    } catch {
      return undefined;
    }
  }

  /**
   * Remove a worktree and clean up the temporary directory.
   */
  async release(tree: WorkingTree): Promise<void> {
    // Discover the bare repo path so we can lock on it.
    let bareRepoPath: string | undefined;
    try {
      const result = await execa(
        "git",
        ["rev-parse", "--git-common-dir"],
        { cwd: tree.workingDir },
      );
      bareRepoPath = result.stdout.trim();
    } catch {
      // If we can't discover the repo path, fall back to unlocked rm.
    }

    if (bareRepoPath) {
      await this.lockFor(bareRepoPath).run(async () => {
        try {
          await execa("git", ["worktree", "remove", "--force", tree.workingDir], {
            cwd: bareRepoPath,
          });
        } catch {
          await rm(tree.workingDir, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 200,
          }).catch(() => {});
        }
      });
    } else {
      // Fallback: force-remove with retries to handle macOS ENOTEMPTY
      await rm(tree.workingDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      }).catch(() => {});
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
    // Remove any stale index.lock files that block git operations
    const lockGlob = join(bareRepoPath, "worktrees", "*", "index.lock");
    await rm(lockGlob, { force: true }).catch(() => {});

    try {
      await execa("git", ["worktree", "remove", "--force", worktreeDir], {
        cwd: bareRepoPath,
      });
    } catch {
      // Retry rm with delay to handle macOS ENOTEMPTY (Spotlight / FSEvents)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await rm(worktreeDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
          return;
        } catch {
          if (attempt < 2) await delay(300);
        }
      }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
