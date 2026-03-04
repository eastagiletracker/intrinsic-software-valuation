# Git

Git client for repository checkout, time-travel worktrees, and log analysis.

## Purpose

Provides a `GitPort` (low-level adapter) and `GitClient` (high-level, multi-repo manager) that abstract all Git CLI operations needed by the ISV Engine. Services interact with checked-out source code through opaque directory paths without knowing about clones, worktrees, or the `git` CLI.

The ISV Engine always operates on **N repositories simultaneously** (e.g. `frontend-app`, `backend-service`, `cms-modules`). The Git client manages the full pool — cloning, time-travel, and cleanup — so that consumers never deal with individual repo lifecycle.

## Initialization and multi-repo management

### Configuration

The Git client is initialized with a list of `RepositoryRef` entries (from `@isv/domain`) and an optional base path for temporary storage:

```typescript
import type { RepositoryRef } from "@isv/domain";

/** Configuration for creating a GitClient instance. */
interface GitClientConfig {
  /** Repositories to manage. At least one required. */
  repositories: RepositoryRef[];
  /** Name of the client data folder inside data/. Resolves to data/<dataFolderName>/git/ */
  dataFolderName: string;
}
```

Each `RepositoryRef` provides either a remote `url` (Git HTTPS or SSH) for cloning, a `localPath` to an existing checkout, or both. The `repositoryId` acts as the stable key to address a specific repo across all operations.

### Factory

Following the established pattern (see `time-tracking/factory.ts`), a factory function creates a configured client:

```typescript
const client = await createGitClient({
  repositories: [
    { repositoryId: "frontend-app", url: "git@github.com:org/frontend.git" },
    { repositoryId: "backend-service", url: "git@github.com:org/backend.git" },
    { repositoryId: "cms", localPath: "/opt/repos/cms" },
  ],
  dataFolderName: "my-client",
});
```

The factory calls `prepare()` for each repository (bare clone or validation of local path) and returns a ready-to-use client that holds the repo pool internally.

### Multi-repo operations

The high-level `GitClient` wraps the low-level `GitPort` with repo-pool awareness:

```typescript
interface GitClient {
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
```

The `checkoutAll()` method is the primary entry point for services: it creates one worktree per managed repo, all at the same `T0` timestamp, and returns them keyed by `repositoryId`. This is exactly what the Architecture Scanner and Status Quo Miner need — a consistent snapshot across all repos at a point in time.

### Disk layout (multi-repo)

```
<basePath>/
├── repos/
│   ├── frontend-app.git/          ← bare clone (cloned once)
│   ├── backend-service.git/       ← bare clone (cloned once)
│   └── cms.git/                   ← bare clone (or symlink to localPath)
│
└── work/
    ├── frontend-app-a1b2c3/       ← worktree at commit from March 2024
    ├── backend-service-d4e5f6/    ← worktree at same timestamp
    ├── cms-g7h8i9/                ← worktree at same timestamp
    │
    ├── frontend-app-x1y2z3/       ← another time-travel (calibration cluster 2)
    ├── backend-service-j0k1l2/    ← ...
    └── cms-m3n4o5/                ← ...
```

## Core pattern: bare clone + worktrees

The Git client follows a **single-clone, many-worktrees** strategy per repository:

1. **One bare clone per repository** — `git clone --bare` creates a local object store without a working tree. This is the only network operation.
2. **N worktrees per analysis request** — `git worktree add` creates isolated working directories, each pinned to a different commit SHA. All worktrees share the bare clone's object store.

This enables concurrent "time-travel" checkouts from the same repository without duplicating data.

### Why bare clone?

- No working tree of its own → no wasted disk space for a checkout nobody reads.
- Worktree-compatible: `git worktree add` works against bare repos.
- Full history available for `git log` queries without any checkout.

### Why worktrees instead of multiple clones?

| Concern | Worktrees | Clone-per-checkout |
|---|---|---|
| Clone count | 1 | N (one per time-travel request) |
| Disk usage | Shared object store; each worktree adds ~1× source file size | Full `.git` duplication per clone |
| Network I/O | One-time clone | One clone per request |
| Concurrent checkouts | Unlimited (by SHA) | Unlimited (but expensive) |
| Cleanup | `git worktree remove` | `rm -rf` entire clone |

### Constraint worth noting

Git does not allow the same **branch name** to be checked out in two worktrees simultaneously. This does not affect the ISV Engine because all checkouts are **detached by commit SHA**, never by branch.

## Lifecycle

```
prepare(ref)
│  git clone --bare <url> <repoPath>       (once per repository)
│  → PreparedRepo { repoPath }
│
├── checkout(repo, before)
│   │  git log --format=%H --before=<T0> -1  (resolve commit)
│   │  git worktree add <tmpDir> <sha>        (create working tree)
│   │  → WorkingTree { workingDir, commitSha }
│   │
│   ├── [service reads files from workingDir]
│   │
│   └── release(tree)
│       git worktree remove <tmpDir>          (cleanup)
│
├── checkout(repo, before)                    (another time-travel, concurrent OK)
│   └── ...
│
└── logStats(repo, opts)
    git log --numstat --after=<since> --before=<until>  (change metrics)
    → GitLogStats { linesAdded, linesDeleted, filesChanged, hotspots }
```

## Two-layer design: Port and Client

Following the established pattern from `time-tracking/` (Port → Client → Factory), the Git module separates low-level Git operations from multi-repo management:

| Layer | Responsibility | Consumed by |
|---|---|---|
| `GitPort` | Single-repo Git CLI operations (clone, worktree, log) | `GitClient` only (internal) |
| `GitClient` | Multi-repo pool management, initialization, lifecycle | Services and pipelines |
| `createGitClient()` | Factory: validates config, prepares all repos, returns client | Pipeline setup code |

Services always use `GitClient`, never `GitPort` directly.

### Port interface (low-level, single-repo)

```typescript
import type { RepositoryRef, IsoTimestamp } from "@isv/domain";

/** Handle to a locally available repository (cloned or pre-existing). */
interface PreparedRepo {
  readonly repositoryId: string;
  /** Path to the bare clone or validated local repo. */
  readonly repoPath: string;
}

/** Handle to an isolated working tree at a specific commit. */
interface WorkingTree {
  readonly repositoryId: string;
  /** Absolute path to the checked-out working directory. */
  readonly workingDir: string;
  /** The exact commit SHA that is checked out. */
  readonly commitSha: string;
}

interface LogStatsOptions {
  since?: IsoTimestamp;
  until?: IsoTimestamp;
  hotspotLimit?: number;
}

interface GitLogStats {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  hotspots: Array<{ file: string; changeCount: number }>;
}

interface GitPort {
  /** Ensure a single repo is available locally (bare clone or reuse). */
  prepare(ref: RepositoryRef, basePath: string): Promise<PreparedRepo>;

  /** Create an isolated worktree at the last commit before the given timestamp. */
  checkout(repo: PreparedRepo, before: IsoTimestamp, workBasePath: string): Promise<WorkingTree>;

  /** Remove the worktree and clean up the temporary directory. */
  release(tree: WorkingTree): Promise<void>;

  /** Extract git log metrics for a time window. */
  logStats(repo: PreparedRepo, opts: LogStatsOptions): Promise<GitLogStats>;
}
```

### Client interface (high-level, multi-repo)

```typescript
interface GitClient {
  /** List all managed repository IDs. */
  repositoryIds(): string[];

  /** Time-travel: checkout all repos at a timestamp. */
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
```

## Consumers

| Service | Client operations used | Purpose |
|---|---|---|
| Architecture Scanner | `checkoutAll`, `release` | LLM reads code from worktrees to produce `SystemContext` per repo |
| Status Quo Miner | `checkoutAll`, `release` | CLI tools (`scc`, `jscpd`) run against each worktree |
| Calibration | `checkout`, `release`, `logStats` | Per-cluster time-travel + change metrics (iterates over many timestamps) |

### Typical service usage

```typescript
// Pipeline setup (once per run)
const git = await createGitClient({
  repositories: [
    { repositoryId: "frontend", url: "git@github.com:org/frontend.git" },
    { repositoryId: "backend", url: "git@github.com:org/backend.git" },
  ],
  dataFolderName: "my-client",
});

// Architecture Scanner / Status Quo Miner (snapshot all repos at T0)
const trees = await git.checkoutAll("2024-03-01T10:00:00Z");
for (const [repoId, tree] of trees) {
  // tree.workingDir → absolute path to read files or run CLI tools
}
await git.releaseAll();

// Calibration (per-cluster, different timestamps)
const tree = await git.checkout("backend", "2024-06-15T00:00:00Z");
const stats = await git.logStats("backend", { since: "2024-03-01T00:00:00Z", until: "2024-06-15T00:00:00Z" });
await git.release(tree);

// Cleanup (end of pipeline)
await git.destroy();
```

## Implementation approach

- **`execa`** wraps all `git` CLI calls (consistent with the `static-analysis` client pattern).
- **`node:fs/promises` `mkdtemp`** manages temporary worktree directories under the configured base path.
- **Repo pool as internal state**: The `GitClient` implementation holds a `Map<string, PreparedRepo>` populated during factory initialization. Active worktrees are tracked for `releaseAll()` and `destroy()`.
- **Idempotent `prepare()`**: If a bare clone for a `repositoryId` already exists at the expected path, skip cloning. If `localPath` is provided and exists, validate it as a Git repo instead of cloning.
- **Error mapping**: `execa` failures are wrapped into the standard `ServiceError` shape (`{ code, message, source: "git-client" }`).
- **No `simple-git` dependency**: The required Git operations (clone, worktree add/remove, log, rev-list) are narrow enough that a direct CLI wrapper is simpler and avoids an unnecessary abstraction layer.

## Contents overview

| File | Description |
|---|---|
| `README.md` | This document — architecture pattern and design decisions |
| `port.ts` | `GitPort` interface, `PreparedRepo`, `WorkingTree`, `LogStatsOptions`, `GitLogStats` types |
| `client.ts` | `GitClient` interface (high-level, multi-repo manager) |
| `client-config.schema.ts` | `GitClientConfig` Zod schema (`repositories` + `dataFolderName`) |
| `client-config.schema.test.ts` | Config schema validation tests |
| `git-worktree.adapter.ts` | `GitWorktreeAdapter` — `GitPort` implementation using `execa` + `git` CLI |
| `git-worktree.adapter.test.ts` | Unit tests for pure parsing helpers (`parseCommitSha`, `parseLogStats`) |
| `factory.ts` | `createGitClient()` factory — validates config, prepares repos, returns `GitClient` |
| `factory.test.ts` | Factory tests (duplicate IDs, local path, missing path) |
| `git.realworld.test.ts` | Real-world integration test against the ISV Engine repository |
| `index.ts` | Public re-exports for the module |

## Open decisions

- **Authentication**: How private repos are accessed (SSH agent, token in URL, credential helper) — affects the `git clone` command but not the worktree pattern. The adapter will pass through whatever credentials the environment provides (SSH agent, Git credential helper, `GIT_ASKPASS`).
- **Concurrency limits**: Maximum simultaneous worktrees during calibration batch runs — likely controlled by the pipeline layer via a semaphore, not by the Git client itself.
- **Large repo optimization**: `--filter=blob:none` (blobless clone) can reduce initial clone time for very large repos. Addable later without changing the port or client interface.
- **`git fetch` for long-running clones**: If the engine runs repeatedly over hours/days, bare clones may become stale. A `refresh(repositoryId?)` method on `GitClient` could run `git fetch` to update. Not needed for single-run pipelines.
