# Calibration Process Stability — Phase 3: Concurrency Safety

## User Story

As a **Technical Product Owner / ISV Analyst**, I want **the historical calibration pipeline to handle concurrent cluster processing without data corruption, worktree conflicts, or silent failures from transient LLM stalls** so that I can **run parallel calibrations over 100+ clusters reliably and trust that all results are accurately persisted**.

---

## Scope

### In scope

- Serialized (mutex-protected) checkpoint writes to prevent concurrent JSONL corruption
- Serialized Git worktree operations per bare repository to eliminate `git worktree prune` race conditions
- LLM stall-timeout retry hardening with progressive backoff and configurable escalation
- Tests at Tier 1–3 per QA strategy

### Out of scope

- New parallelism model changes (Phase 2 already provides `p-queue`)
- Structured logging / metrics (Phase 3 Operational Maturity, separate track)
- Web UI changes
- Changes to the ISV Calculation Pipeline (single-ticket, no concurrency issues)

---

## Preconditions

Phase 2 (Parallelism & Persistence) must be complete:

- `p-queue` cluster processing is functional with configurable concurrency
- LLM semaphore gates concurrent LLM API calls
- Per-cluster `release(tree)` is in place
- JSONL checkpoint + SQLite run store are functional

---

## Reference Documents

- [Phase 1 Requirements](requirements.md) — Retry, checkpoint, progress, CLI
- [Phase 2 Requirements](phase-2-requirements.md) — Parallelism, persistence, LLM semaphore
- [Architecture](../../docs/architecture/architecture.md) — Layer dependency rules
- [QA Strategy](../../docs/qa-strategy.md) — Testing tiers

---

## Context

After Phase 2, the calibration pipeline processes clusters concurrently (default concurrency 3). Three categories of failures have been observed in production runs:

1. **Checkpoint data loss** — The `CheckpointWriter.appendLine()` method uses a read-modify-write cycle (read existing → append line → write `.tmp` → rename) with no synchronization. When two concurrent clusters complete simultaneously, both read the same existing content, both write to the same `.tmp` path, and the second `rename` overwrites the first cluster's result. Additionally, if `writeFile` fails (disk full, permission), the `.tmp` file does not exist at `rename` time, producing an ENOENT error.

2. **Git worktree race condition** — Each `GitWorktreeAdapter.checkout()` call executes `git worktree prune` followed by `git worktree add` on the same bare repository. With concurrency 3, three clusters may call `checkout()` simultaneously for the same repo. The `prune` command from one cluster can interfere with another cluster's worktree registration if the timing overlaps with `add`. After the worktree directory disappears, the Status Quo Miner (via `scc`) or Architecture Scanner throws ENOENT when accessing the working directory.

3. **LLM stall exhausts retries** — The GitHub Copilot CLI adapter detects stalled requests (no stdout/stderr for `stallTimeoutMs`) and kills the process. With `retryAsync` (3 retries), a stall on every attempt permanently skips the cluster. When the LLM backend is under load, stalls tend to happen in bursts, so all 3 retries fail within the same congestion window.

---

## Acceptance Criteria

### AC-1 — Serialized Checkpoint Writes (Mutex)

**Problem**: Concurrent `appendLine()` calls cause a read-modify-write race on the JSONL checkpoint file, leading to lost entries or ENOENT on the `.tmp` rename.

**Root cause file**: `packages/pipelines/src/shared/checkpoint.ts` — `appendLine()` method.

- [ ] **AC-1.1** `CheckpointWriter` uses an internal async mutex (or equivalent serialization) so that only one `appendLine()` call executes at a time. Concurrent callers queue and execute sequentially.
- [ ] **AC-1.2** The mutex is implemented without new runtime dependencies — use a simple promise-chain pattern or `Mutex` from an already-included library.
- [ ] **AC-1.3** Each `appendLine()` call uses a unique `.tmp` filename (e.g. `progress.jsonl.tmp.<random>`) to prevent two callers from writing to the same temp file even if the mutex were somehow bypassed.
- [ ] **AC-1.4** If `writeFile()` fails, the error propagates to the caller with a descriptive message (no silent swallowing). The `.tmp` file is cleaned up on failure.
- [ ] **AC-1.5** Tier 1 unit test: 10 concurrent `append()` calls all complete without data loss — final file contains all 10 entries.
- [ ] **AC-1.6** Tier 1 unit test: a `writeFile` failure (e.g. simulated via mock) produces a clear error and does not leave a stale `.tmp` file.

### AC-2 — Serialized Git Worktree Operations Per Repository

**Problem**: Concurrent `checkout()` calls on the same bare repository interleave `git worktree prune` and `git worktree add`, causing worktree registration corruption or premature removal.

**Root cause file**: `packages/clients/src/git/git-worktree.adapter.ts` — `checkout()` method calls `prune` then `add` non-atomically; `packages/clients/src/git/factory.ts` — `checkoutAll()` calls `checkout()` for all repos in parallel via `Promise.all`.

- [ ] **AC-2.1** Git worktree operations (`checkout`, `release`) for the same bare repository are serialized using a per-repo mutex/lock. Different repositories can still be operated on concurrently.
- [ ] **AC-2.2** The per-repo lock is keyed by `repo.repoPath` (the bare clone path) and lives inside `GitWorktreeAdapter` or is injected via the factory.
- [ ] **AC-2.3** `checkout()` acquires the repo lock before running `prune` + `add`, and releases it after `add` completes (or after cleanup on failure).
- [ ] **AC-2.4** `release()` acquires the same repo lock before running `git worktree remove`, and releases it after completion.
- [ ] **AC-2.5** `checkoutAll()` continues to call `checkout()` for each repo in parallel (via `Promise.all`). The per-repo lock only serializes operations on the same repo — different repos remain concurrent.
- [ ] **AC-2.6** When multiple clusters resolve to the same commit SHA, each gets an independent worktree (unique suffix preserved). The lock ensures that `prune` from one cluster never runs while another cluster's `add` is in progress.
- [ ] **AC-2.7** Tier 1 unit test: 5 concurrent `checkout()` calls on the same repo all succeed and produce distinct, accessible worktree directories.
- [ ] **AC-2.8** Tier 1 unit test: concurrent `checkout()` and `release()` on the same repo do not cause ENOENT or corruption.
- [ ] **AC-2.9** Tier 3 boundary test: a calibration run with concurrency 3 on a single-repo project produces zero worktree ENOENT errors across 10+ clusters.

### AC-3 — LLM Stall-Timeout Retry Hardening

**Problem**: The stall-timeout error (`LLM request stalled (no output for Xms)`) exhausts all retries during LLM congestion bursts because retries fire immediately into the same congestion window.

**Root cause file**: `packages/clients/src/llm/github-copilot-cli/adapter.ts` — stall detection; `packages/pipelines/src/shared/retry.ts` / p-retry usage — retry timing.

- [ ] **AC-3.1** When a stall-timeout error occurs, the retry backoff starts at a higher base delay than for other transient errors. Minimum 10 seconds before the first retry of a stall, increasing with exponential backoff (e.g. 10s → 20s → 40s).
- [ ] **AC-3.2** Stall-timeout errors are identified by a machine-readable property on the thrown `Error` (e.g. `error.code === 'LLM_STALL'` or `error.cause`) rather than parsing the message string.
- [ ] **AC-3.3** The `shouldRetry` predicate classifies stall-timeout errors as retryable (they are transient).
- [ ] **AC-3.4** The maximum retry count for stall errors is configurable separately from general retry count, defaulting to 4 (one more than the current default of 3).
- [ ] **AC-3.5** When a stall-timeout triggers a retry, the `onProgress` callback emits a progress event with status `'retrying'` and a detail message including the attempt number and wait time.
- [ ] **AC-3.6** Tier 1 unit test: a stall error triggers retry with ≥ 10s delay before first attempt (using fake timers).
- [ ] **AC-3.7** Tier 1 unit test: after stall retry exhaustion, the original stall error is thrown (not wrapped).

---

## Implementation Notes

### Mutex pattern (AC-1, AC-2)

A minimal async mutex can be implemented as a promise chain:

```typescript
class AsyncMutex {
  private chain = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);  // run fn regardless of prior rejection
    this.chain = next.then(() => {}, () => {});  // swallow to keep chain alive
    return next;
  }
}
```

This adds no dependencies and provides sequential execution for queued operations.

### Per-repo lock map (AC-2)

```typescript
private readonly repoLocks = new Map<string, AsyncMutex>();
private lockFor(repoPath: string): AsyncMutex {
  let lock = this.repoLocks.get(repoPath);
  if (!lock) { lock = new AsyncMutex(); this.repoLocks.set(repoPath, lock); }
  return lock;
}
```

### Stall error identification (AC-3)

Extend the stall-timeout `Error` with a typed `code` property for machine-readable classification:

```typescript
const err = new Error(`LLM request stalled (no output for ${this.stallTimeoutMs}ms).`);
(err as any).code = 'LLM_STALL';
reject(err);
```

---

## Handoff Expectation

After implementation, provide:

- Summary of changed files
- Confirmation that existing Phase 1 + Phase 2 tests still pass
- Any open questions about whether the SQLite `RunStore` write path also needs serialization (it likely does not, since `better-sqlite3` / `node:sqlite` are synchronous-per-call)
