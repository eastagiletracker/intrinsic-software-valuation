import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import type { IsoTimestamp } from "@isv/domain";
import { ServiceException } from "@isv/domain";

import type { CacheConfig } from "../cache/cache-config.schema.js";
import { FileCache } from "../cache/file-cache.js";

import { CachedGitClient } from "./cached-git-client.js";
import type { GitClient } from "./client.js";
import type { GitClientConfig } from "./client-config.schema.js";
import { GitWorktreeAdapter } from "./git-worktree.adapter.js";
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
): ServiceException {
  return new ServiceException(code, message, "git-client", context);
}

// ---------------------------------------------------------------------------
// DefaultGitClient
// ---------------------------------------------------------------------------

/**
 * Default `GitClient` implementation.
 *
 * Holds a pool of prepared repositories and tracks active worktrees for
 * cleanup. All Git CLI operations are delegated to a `GitPort` adapter.
 */
class DefaultGitClient implements GitClient {
  private readonly port: GitPort;
  private readonly repos: Map<string, PreparedRepo>;
  private readonly activeWorktrees: Set<WorkingTree> = new Set();
  private readonly basePath: string;

  constructor(
    port: GitPort,
    repos: Map<string, PreparedRepo>,
    basePath: string,
  ) {
    this.port = port;
    this.repos = repos;
    this.basePath = basePath;
  }

  repositoryIds(): string[] {
    return Array.from(this.repos.keys());
  }

  async checkoutAll(
    before: IsoTimestamp,
  ): Promise<Map<string, WorkingTree>> {
    const workBasePath = resolve(this.basePath, "work");
    const results = new Map<string, WorkingTree>();

    for (const [id, repo] of this.repos) {
      const tree = await this.port.checkout(repo, before, workBasePath);
      this.activeWorktrees.add(tree);
      results.set(id, tree);
    }

    return results;
  }

  async checkout(
    repositoryId: string,
    before: IsoTimestamp,
  ): Promise<WorkingTree> {
    const repo = this.repos.get(repositoryId);
    if (!repo) {
      throw gitError(
        "REPO_NOT_FOUND",
        `Repository "${repositoryId}" is not managed by this client`,
      );
    }

    const workBasePath = resolve(this.basePath, "work");
    const tree = await this.port.checkout(repo, before, workBasePath);
    this.activeWorktrees.add(tree);
    return tree;
  }

  async release(tree: WorkingTree): Promise<void> {
    await this.port.release(tree);
    this.activeWorktrees.delete(tree);
  }

  async releaseAll(): Promise<void> {
    const trees = Array.from(this.activeWorktrees);
    for (const tree of trees) {
      await this.port.release(tree);
      this.activeWorktrees.delete(tree);
    }
  }

  async logStats(
    repositoryId: string,
    opts: LogStatsOptions,
  ): Promise<GitLogStats> {
    const repo = this.repos.get(repositoryId);
    if (!repo) {
      throw gitError(
        "REPO_NOT_FOUND",
        `Repository "${repositoryId}" is not managed by this client`,
      );
    }

    return this.port.logStats(repo, opts);
  }

  async destroy(): Promise<void> {
    await this.releaseAll();
    await rm(this.basePath, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ready-to-use `GitClient` from project-specific config.
 *
 * The factory validates the config, prepares all repositories (bare clone
 * or local path validation), and returns a client that manages the full
 * repository pool.
 *
 * @param config - Project-specific configuration (repositories + data folder).
 * @param cacheConfig - Optional cache configuration. When enabled, logStats results are cached.
 * @returns A `Promise` resolving to an initialised `GitClient`.
 */
export async function createGitClient(
  config: GitClientConfig,
  cacheConfig?: CacheConfig,
): Promise<GitClient> {
  // Reject duplicate repositoryIds
  const ids = config.repositories.map((r) => r.repositoryId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    throw gitError(
      "DUPLICATE_REPOSITORY_ID",
      `Duplicate repositoryId(s) in config: ${[...new Set(duplicates)].join(", ")}`,
    );
  }

  const basePath = resolve("data", config.dataFolderName, "git");
  const port = new GitWorktreeAdapter();

  // Prepare all repositories
  const repos = new Map<string, PreparedRepo>();
  for (const ref of config.repositories) {
    const prepared = await port.prepare(ref, basePath);
    repos.set(ref.repositoryId, prepared);
  }

  const client: GitClient = new DefaultGitClient(port, repos, basePath);

  if (cacheConfig?.enabled) {
    return new CachedGitClient(client, new FileCache(cacheConfig));
  }
  return client;
}
