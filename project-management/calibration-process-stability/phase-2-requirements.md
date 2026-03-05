# Calibration Process Stability — Phase 2: Parallelism & Persistence

## User Story

As a **Technical Product Owner / ISV Analyst**, I want **the historical calibration pipeline to process clusters concurrently with configurable parallelism, persist run and cluster state in a queryable local database, and gate LLM calls with a shared semaphore** so that I can **reduce total calibration time from hours to minutes for ~100 clusters, scale confidently toward thousands of clusters, inspect run history and cluster status without parsing log files, and avoid LLM rate-limit failures when multiple clusters call the API simultaneously**.

---

## Scope

### In scope

- Concurrent cluster processing via `p-queue` with configurable `concurrency` parameter
- Retry via `p-retry` replacing Phase 1's hand-rolled `retryAsync`
- LLM semaphore limiting concurrent LLM API calls independently of worker count
- `RunStore` port interface abstracting run/cluster persistence
- `node:sqlite` adapter implementing `RunStore` (SQLite database per calibration run)
- `isv init --project <slug>` CLI command for project setup/validation
- `isv calibrate --concurrency <n>` CLI flag for parallelism control
- Migration from JSONL checkpoint to SQLite-backed state (with JSONL kept as optional human-readable export)
- Tests at Tier 1–3 per QA strategy

### Out of scope

- Web UI calibration trigger (decided: web is demo-only)
- Multi-machine / distributed processing
- Worker threads (`node:worker_threads`) — workload is I/O-bound, not CPU-bound
- Structured logging / metrics / resource monitoring (Phase 3)

---

## Preconditions

Phase 1 (Resilience & Observability) must be complete:

- `retryAsync` utility exists and is applied in the pipeline
- JSONL checkpoint is functional
- `onProgress` callback is wired
- `isv calibrate --project <slug>` is functional (sequential)
- Per-cluster `release(tree)` replaces global `releaseAll()`

---

## Reference Documents

- [Architecture — Batch Processing Architecture](../../docs/architecture/architecture.md#batch-processing-architecture) — Concurrency model, data flow, layer placement
- [Tech Stack — Key Libraries (Decided)](../../docs/architecture/techstack.md#key-libraries-decided) — `p-queue`, `p-retry`, `node:sqlite` decisions and rejected alternatives
- [Phase 1 Requirements](requirements.md) — Prerequisite: retry, checkpoint, progress, CLI
- [Historical Calibration Requirements](../historical-calibration/requirements.md) — Full calibration feature scope
- [QA Strategy](../../docs/qa-strategy.md) — Testing tiers

---

## Context

After Phase 1, the calibration pipeline processes clusters **sequentially** with retry, checkpoint, and progress reporting. For ~100 clusters where each takes 30–120 seconds (LLM calls dominate), a full run takes 1–3 hours.

The main bottleneck is I/O wait: LLM API calls, Git checkout, and file-system operations. Multiple clusters can be processed concurrently since each cluster operates on its own Git worktrees and produces independent results. The key constraint is the LLM API: concurrent calls must be rate-limited to avoid 429 errors.

Phase 2 converts the sequential loop to a concurrent work queue, replacing the JSONL checkpoint with a queryable SQLite store for operational visibility.

---

## Acceptance Criteria

### AC-1 — Concurrent Queue (`p-queue`)

- [ ] **AC-1.1** `p-queue` is added as a runtime dependency to `@isv/pipelines`.
- [ ] **AC-1.2** The cluster processing loop (current `for…of` over clusters) is replaced by a `PQueue` with configurable concurrency.
- [ ] **AC-1.3** `HistoricalCalibrationConfig` gains an optional `concurrency?: number` field (default: 3).
- [ ] **AC-1.4** Each cluster is enqueued as a separate task. Tasks run concurrently up to the configured limit.
- [ ] **AC-1.5** `PQueue` events (`completed`, `error`) are mapped to the existing `onProgress` callback — progress events are emitted as clusters complete, not just when they start.
- [ ] **AC-1.6** Per-task timeout is configurable via `taskTimeoutMs?: number` on config (default: 300 000 ms / 5 min). If a cluster exceeds the timeout, it is marked as failed and the next cluster proceeds.
- [ ] **AC-1.7** The queue supports pause/resume — on receiving `SIGINT`, the queue is paused, in-flight tasks complete, and committed results are persisted before exit.
- [ ] **AC-1.8** Tier 3 boundary test verifies: N clusters are processed with concurrency M, completion order is non-deterministic, all results are collected correctly.

### AC-2 — Retry (`p-retry` replacing `retryAsync`)

- [ ] **AC-2.1** `p-retry` is added as a runtime dependency to `@isv/pipelines`.
- [ ] **AC-2.2** Phase 1's hand-rolled `retryAsync` in `packages/pipelines/src/shared/retry.ts` is replaced by `p-retry` calls.
- [ ] **AC-2.3** Retry wraps the same operations as Phase 1: `architectureScanner.scan()`, `gapAnalyzer.analyze()`, `gitClient.checkoutAll()`.
- [ ] **AC-2.4** Retry config: 3 retries, exponential backoff (1s base), `shouldRetry` predicate that retries on transient errors (network, timeout, 429/5xx) but not on validation or configuration errors.
- [ ] **AC-2.5** `onFailedAttempt` callback logs retry attempts to the progress callback with a `'retrying'` status.
- [ ] **AC-2.6** Existing Phase 1 retry tests are updated to use `p-retry` API. No regression in retry behavior.

### AC-3 — LLM Semaphore

- [ ] **AC-3.1** A shared LLM concurrency gate limits the number of simultaneous LLM API calls across all cluster workers.
- [ ] **AC-3.2** Default LLM concurrency: 2. Configurable via `llmConcurrency?: number` on `HistoricalCalibrationConfig`.
- [ ] **AC-3.3** The semaphore is independent of the cluster worker count — e.g. 5 cluster workers with LLM concurrency 2 means at most 2 LLM calls at any moment, regardless of how many clusters are in-flight.
- [ ] **AC-3.4** Implementation uses either `p-limit` or a dedicated `PQueue` instance — either is acceptable as long as the LLM gate is decoupled from the cluster queue.
- [ ] **AC-3.5** The LLM-gated wrapper is injected into cluster processing, wrapping `architectureScanner.scan()` and `gapAnalyzer.analyze()` (the two LLM-calling operations).
- [ ] **AC-3.6** Tier 1 unit test verifies: with concurrency 2, a burst of 5 calls never exceeds 2 concurrent executions.

### AC-4 — `RunStore` Port Interface

- [ ] **AC-4.1** A new port interface `RunStore` is defined in `packages/pipelines/src/shared/run-store.port.ts`.
- [ ] **AC-4.2** `RunStore` exposes at minimum:
  - `createRun(config: RunConfig): RunRecord`
  - `getRun(runId: string): RunRecord | undefined`
  - `updateRunStatus(runId: string, status: RunStatus): void`
  - `completeRun(runId: string, result: CalibrationRunOutput): void`
  - `createClusters(runId: string, clusterIds: string[]): void`
  - `updateCluster(runId: string, clusterId: string, status: ClusterStatus, data?: ShipUnitCluster): void`
  - `getCluster(runId: string, clusterId: string): ClusterRecord | undefined`
  - `getClustersByStatus(runId: string, status: ClusterStatus): ClusterRecord[]`
  - `listRuns(): RunRecord[]`
- [ ] **AC-4.3** `RunStatus` is a union: `'pending' | 'running' | 'completed' | 'failed'`.
- [ ] **AC-4.4** `ClusterStatus` is a union: `'pending' | 'running' | 'done' | 'failed' | 'skipped'`.
- [ ] **AC-4.5** `RunRecord` includes: `runId`, `projectSlug`, `config` (serialized), `status`, `createdAt`, `updatedAt`, `result?` (serialized).
- [ ] **AC-4.6** `ClusterRecord` includes: `clusterId`, `runId`, `status`, `retryCount`, `data?` (serialized `ShipUnitCluster`), `error?`, `updatedAt`.
- [ ] **AC-4.7** The port is in `@isv/pipelines` (not `@isv/clients`) — it stores pipeline-internal orchestration state.

### AC-5 — `node:sqlite` RunStore Adapter

- [ ] **AC-5.1** A `SqliteRunStore` class implements `RunStore` using `node:sqlite` (`DatabaseSync` / `StatementSync`).
- [ ] **AC-5.2** The database file is created at `data/<projectSlug>/calibration-runs/<runId>/store.db`.
- [ ] **AC-5.3** Schema is initialized with `CREATE TABLE IF NOT EXISTS` on construction — no separate migration step needed for v1.
- [ ] **AC-5.4** WAL mode is enabled (`PRAGMA journal_mode = WAL`) for safe concurrent reads during writes.
- [ ] **AC-5.5** JSON data (config, result, cluster data) is stored as `TEXT` columns and parsed with `JSON.parse` on read.
- [ ] **AC-5.6** The `--no-warnings=ExperimentalWarning` flag is added to the CLI entry point to suppress the `node:sqlite` experimental warning.
- [ ] **AC-5.7** If `node:sqlite` is unavailable at runtime (e.g. older Node version), the adapter throws a clear error message suggesting Node 24+ or the `better-sqlite3` fallback.
- [ ] **AC-5.8** Tier 1 unit tests verify: CRUD round-trips for runs and clusters, status filtering, concurrent write safety (multiple updates in rapid succession), schema creation on fresh DB.
- [ ] **AC-5.9** Tier 2 adapter test verifies: database file is created at the correct path, survives process restart (close and reopen), and returns consistent data.

### AC-6 — Pipeline Integration

- [ ] **AC-6.1** The pipeline creates a `RunStore` at the start of `run()` and records all cluster state transitions through it.
- [ ] **AC-6.2** On resume (existing `runId`), the pipeline loads cluster statuses from the `RunStore` instead of the JSONL checkpoint. Clusters with status `'done'` are restored directly. Clusters with status `'failed'` or `'skipped'` are skipped (same behavior as Phase 1 checkpoint).
- [ ] **AC-6.3** The `RunStore` replaces the JSONL checkpoint as the primary state mechanism. The JSONL file may optionally still be written alongside for human-readable debugging.
- [ ] **AC-6.4** On pipeline success, `RunStore.completeRun()` persists the full `CalibrationRunOutput`.
- [ ] **AC-6.5** On pipeline failure, `RunStore.updateRunStatus(runId, 'failed')` is called before returning the error `Result`.
- [ ] **AC-6.6** Tier 3 boundary test verifies: a pipeline run with `concurrency: 3` uses the `RunStore` for state, resumes correctly from a partial run, and produces the same `CalibrationRunOutput` as a sequential run.

### AC-7 — CLI Enhancements

- [ ] **AC-7.1** `isv calibrate` gains `--concurrency <n>` flag (default: 3). Mapped to `config.concurrency`.
- [ ] **AC-7.2** `isv calibrate` gains `--llm-concurrency <n>` flag (default: 2). Mapped to `config.llmConcurrency`.
- [ ] **AC-7.3** `isv calibrate --status --project <slug>` lists all runs for a project with their status, cluster counts, and timestamps (reads from `RunStore`).
- [ ] **AC-7.4** `isv calibrate --status --run-id <id> --project <slug>` shows detailed cluster-level status for a specific run.
- [ ] **AC-7.5** On `SIGINT` (Ctrl+C), the CLI prints a message ("Pausing — waiting for in-flight clusters to complete…"), pauses the queue, waits for in-flight tasks, persists state, and exits cleanly with code 130.

### AC-8 — `isv init` Command

- [ ] **AC-8.1** `isv init --project <slug>` creates the project directory structure: `data/<slug>/calibration-runs/`, `data/<slug>/git/repos/`, `data/<slug>/git/work/`.
- [ ] **AC-8.2** If `data/<slug>/project-config.json` does not exist, `isv init` creates a template config with placeholder values and prints instructions for the operator to fill them in.
- [ ] **AC-8.3** If `data/<slug>/project-config.json` already exists, `isv init` validates it against the `ProjectConfigSchema` and reports errors or confirms validity.
- [ ] **AC-8.4** `isv init` runs the equivalent of `check-project.sh` validations: Git repos accessible, Jira data file exists, time-tracking file exists.
- [ ] **AC-8.5** `isv init` is idempotent — running it twice on the same project does not overwrite existing data or config.
- [ ] **AC-8.6** `isv calibrate` checks that `isv init` has been run (project directories exist) and prints a clear error message if not.

---

## Technical Notes

### New Files

| File | Purpose |
| --- | --- |
| `packages/pipelines/src/shared/run-store.port.ts` | `RunStore` interface, `RunRecord`, `ClusterRecord`, status types |
| `packages/pipelines/src/shared/sqlite-run-store.ts` | `SqliteRunStore` — `node:sqlite` implementation of `RunStore` |
| `packages/pipelines/src/shared/llm-semaphore.ts` | LLM concurrency gate factory (wraps `p-limit` or `PQueue`) |

### Modified Files

| File | Changes |
| --- | --- |
| `packages/pipelines/package.json` | Add `p-queue`, `p-retry` as runtime dependencies |
| `packages/pipelines/src/shared/retry.ts` | Replace `retryAsync` implementation with `p-retry` wrapper (preserve export signature or re-export) |
| `packages/pipelines/src/historical-calibration/port.ts` | Add `concurrency?`, `llmConcurrency?`, `taskTimeoutMs?` to config |
| `packages/pipelines/src/historical-calibration/pipeline.ts` | Replace `for…of` with `PQueue`, integrate `RunStore`, wire LLM semaphore, add `SIGINT` handling |
| `packages/pipelines/src/historical-calibration/config-factory.ts` | Instantiate `SqliteRunStore`, pass to pipeline |
| `packages/interfaces/cli/src/main.ts` | Add `--concurrency`, `--llm-concurrency`, `--status` flags; add `init` command; add `SIGINT` handler |

### Affected Packages

| Package | Changes |
| --- | --- |
| `@isv/pipelines` | New dependencies (`p-queue`, `p-retry`), `RunStore` port + SQLite adapter, LLM semaphore, parallel pipeline |
| `@isv/interfaces/cli` | New CLI flags, `isv init` command, `SIGINT` handling, run status display |

### New Dependencies

| Package | Version | Type | Size | Transitive deps |
| --- | --- | --- | --- | --- |
| `p-queue` | ^8.x | runtime | 77 kB | 2 (`eventemitter3`, `p-timeout`) |
| `p-retry` | ^6.x | runtime | 23 kB | 1 (`@types/retry`) |
| `node:sqlite` | built-in | — | 0 | 0 |

Total new external packages: **2**. Total native addon dependencies: **0**.

### Design Decisions

- **`p-queue` over custom implementation** — Concurrency control with events, pause/resume, and per-task timeout is a solved problem. `p-queue` is feature-complete, pure ESM, and has 19M weekly downloads. A custom Semaphore + WorkQueue + `Promise.all` would reimplement the same functionality with higher maintenance risk.
- **`p-retry` replaces `retryAsync`** — Phase 1's hand-rolled retry (~30 lines) served its zero-dependency goal. Phase 2 already adds `p-queue` (same author ecosystem), so `p-retry` is a natural complement. Less code to maintain, plus `AbortSignal` and `onFailedAttempt` for free.
- **`node:sqlite` over `better-sqlite3`** — Zero dependencies (built into Node 24), same synchronous API style, no native addon build friction, no prebuild lag on new Node releases. Stability 1.1 risk mitigated by `RunStore` port interface — one adapter file to swap if needed.
- **`RunStore` in `@isv/pipelines`, not `@isv/clients`** — The store holds pipeline orchestration state (run status, cluster progress), not external system data. Placing it in pipelines preserves the layer dependency rule.
- **LLM semaphore independent of worker count** — The LLM API is the shared constraint. 5 cluster workers with LLM limit 2 means at most 2 LLM calls at any time. This prevents 429 errors regardless of how aggressively clusters are parallelized.
- **`isv init` as explicit prerequisite** — Mirrors the existing `check-project.sh` pattern. Ensures directory structure and config are valid before a long-running calibration. Fail-fast over mid-run discovery.
- **SIGINT graceful shutdown** — Long-running batch jobs must handle Ctrl+C without losing in-flight work. Pause queue → wait for active tasks → persist state → exit.

### Estimation Guidance

| Area | Relative size |
| --- | --- |
| `p-queue` integration + parallel pipeline | Medium–Large |
| `p-retry` migration from `retryAsync` | Small |
| LLM semaphore | Small |
| `RunStore` port interface | Small |
| `SqliteRunStore` adapter + tests | Medium |
| Pipeline integration (store + queue + resume) | Medium–Large |
| CLI enhancements (flags, status, SIGINT) | Medium |
| `isv init` command | Small–Medium |
| Integration / boundary tests | Medium |
