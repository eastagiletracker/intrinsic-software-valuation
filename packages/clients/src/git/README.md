# Git

Git client for repository checkout, time-travel worktrees, and log analysis.

## Purpose

Provides a `GitPort` interface that abstracts all Git CLI operations needed by the ISV Engine. Services interact with checked-out source code through opaque directory paths without knowing about clones, worktrees, or the `git` CLI.

## Core pattern: bare clone + worktrees

The Git client follows a **single-clone, many-worktrees** strategy:

1. **One bare clone per repository** — `git clone --bare` creates a local object store without a working tree. This is the only network operation.
2. **N worktrees per analysis request** — `git worktree add` creates isolated working directories, each pinned to a different commit SHA. All worktrees share the bare clone's object store.

This enables concurrent "time-travel" checkouts from the same repository without duplicating data.

```
/tmp/isv/repos/
└── backend-service.git/          ← bare clone (object store, cloned once)

/tmp/isv/work/
├── backend-service-cluster-42/   ← worktree at commit from March 2024
├── backend-service-cluster-99/   ← worktree at commit from June 2024
└── backend-service-cluster-107/  ← worktree at commit from Sept 2024
```

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

## Port interface (planned)

The stable contract consumed by services:

```typescript
import type { RepositoryRef, IsoTimestamp } from "@isv/domain";

/** Handle to a locally available repository (cloned or pre-existing). */
interface PreparedRepo {
  readonly repositoryId: string;
  readonly repoPath: string;
}

/** Handle to an isolated working tree at a specific commit. */
interface WorkingTree {
  readonly repositoryId: string;
  readonly workingDir: string;
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
  /** Ensure repo is available locally (bare clone or reuse). */
  prepare(ref: RepositoryRef): Promise<PreparedRepo>;

  /** Create an isolated worktree at the last commit before the given timestamp. */
  checkout(repo: PreparedRepo, before: IsoTimestamp): Promise<WorkingTree>;

  /** Remove the worktree and clean up the temporary directory. */
  release(tree: WorkingTree): Promise<void>;

  /** Extract git log metrics for a time window. */
  logStats(repo: PreparedRepo, opts: LogStatsOptions): Promise<GitLogStats>;
}
```

## Consumers

| Service | Operations used | Purpose |
|---|---|---|
| Architecture Scanner | `prepare`, `checkout`, `release` | LLM reads code from worktree to produce `SystemContext` |
| Status Quo Miner | `prepare`, `checkout`, `release` | CLI tools (`scc`, `jscpd`) run against worktree |
| Calibration | `prepare`, `checkout`, `release`, `logStats` | Batch time-travel per cluster + change metrics |

## Implementation approach

- **`execa`** wraps all `git` CLI calls (consistent with the `static-analysis` client pattern).
- **`node:fs/promises` `mkdtemp`** manages temporary worktree directories under a configurable base path (default: `os.tmpdir()/isv-git/`).
- **Error mapping**: `execa` failures are wrapped into the standard `ServiceError` shape (`{ code, message, source: "git-client" }`).
- **No `simple-git` dependency**: The required Git operations (clone, worktree add/remove, log, rev-list) are narrow enough that a direct CLI wrapper is simpler and avoids an unnecessary abstraction layer.

## Contents overview

| File | Description |
|---|---|
| `README.md` | This document — architecture pattern and design decisions |
| `index.ts` | Public re-exports for the module |

## Open decisions

- **Authentication**: How private repos are accessed (SSH agent, token in URL, credential helper) — affects the `git clone` command but not the worktree pattern.
- **Concurrency limits**: Maximum simultaneous worktrees during calibration batch runs — likely controlled by the pipeline layer via a semaphore, not by the Git client itself.
- **Large repo optimization**: `--filter=blob:none` (blobless clone) can reduce initial clone time for very large repos. Addable later without changing the port interface.
