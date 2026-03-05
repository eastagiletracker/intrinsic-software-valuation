# Calibration Process Stability — Phase 1: Resilience & Observability

## User Story

As a **Technical Product Owner / ISV Analyst**, I want **the historical calibration pipeline to automatically retry transient failures, resume from a checkpoint after a crash or interruption, and report live progress to the CLI** so that I can **run calibrations over ~100 clusters without babysitting, confidently restart an interrupted run without losing completed work, and understand where the pipeline stands at any moment**.

---

## Scope

### In scope

- Generic async retry utility with exponential backoff for transient service/client failures
- JSONL-based checkpoint file that records each completed cluster so re-runs skip already-processed work
- `onProgress` callback on the calibration pipeline, reusing the `PipelineProgressCallback` pattern from ISV calculation
- Wiring `isv calibrate` in the CLI to instantiate the full pipeline and print progress to console
- Per-cluster `release(tree)` instead of global `releaseAll()` in the cluster loop to prepare for future parallelism
- Tests at Tier 1–3 per QA strategy

### Out of scope

- Parallel cluster processing (Phase 2)
- Persistent job store / SQLite (Phase 2)
- Worker pool / concurrency management (Phase 2)
- Web UI calibration trigger (decided: web is demo-only)
- `isv init` command (Phase 2 prerequisite)

---

## Reference Documents

- [ISV Engine - 03 - Historical Calibration](../../docs/concept/ISV%20Engine%20-%2003%20-%20Historical%20Calibration.md) — Authoritative concept
- [Historical Calibration Requirements](../historical-calibration/requirements.md) — Full calibration feature scope
- [QA Strategy](../../docs/qa-strategy.md) — Testing tiers
- [Architecture](../../docs/architecture/architecture.md) — Layer dependency rules

---

## Context

The current `HistoricalCalibrationPipeline.run()` processes clusters in a sequential `for…of` loop. Per-cluster failures are caught and the cluster is added to `skippedClusters`, but:

1. **No retry** — a single transient LLM timeout or Git checkout hiccup permanently skips the cluster.
2. **No checkpoint** — if the process crashes at cluster 80/100, all 79 completed results are lost and must be recomputed.
3. **No progress visibility** — the operator has no way to know which cluster is being processed or how far along the run is.
4. **Global `releaseAll()`** — the `finally` block releases all Git worktrees globally, which prevents future parallel cluster processing and can interfere with concurrent operations.
5. **CLI stub** — `isv calibrate` prints a placeholder message and does not instantiate the pipeline.

Phase 1 addresses items 1–5 with zero new dependencies, staying within the single-process Node.js model.

---

## Acceptance Criteria

### AC-1 — Retry Utility

- [ ] **AC-1.1** A new shared module `packages/pipelines/src/shared/retry.ts` exports a generic `retryAsync<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>` function.
- [ ] **AC-1.2** `RetryOptions` supports: `maxRetries` (default: 3), `baseDelayMs` (default: 1 000), `backoffFactor` (default: 2), optional `shouldRetry?: (error: unknown) => boolean` predicate.
- [ ] **AC-1.3** Delays follow exponential backoff: attempt _n_ waits `baseDelayMs × backoffFactor^(n−1)` ms before retrying.
- [ ] **AC-1.4** After all retries are exhausted, the original error is thrown (not wrapped).
- [ ] **AC-1.5** `retryAsync` is applied in the calibration pipeline to `architectureScanner.scan()`, `gapAnalyzer.analyze()`, and `gitClient.checkoutAll()` — the three calls with external I/O most likely to fail transiently.
- [ ] **AC-1.6** `retryAsync` is **not** applied to `valuation.calculate()` or `calibration.calibrate()` — these are pure computations that do not benefit from retry.
- [ ] **AC-1.7** Tier 1 unit test verifies: successful on first try, successful on second try after one failure, failure after `maxRetries` exhausted, backoff timing (using fake timers or injected delay), custom `shouldRetry` predicate.

### AC-2 — Checkpoint / Resume

- [ ] **AC-2.1** A new shared module `packages/pipelines/src/shared/checkpoint.ts` exports `CheckpointWriter` and `CheckpointReader` classes (or equivalent functions).
- [ ] **AC-2.2** `CheckpointWriter.append(clusterId: string, data: ShipUnitCluster)` appends one JSON line to a JSONL file. Each line is a self-contained JSON object with at minimum `{ clusterId, timestamp, data }`.
- [ ] **AC-2.3** `CheckpointWriter` performs atomic writes: write to a temp file, then rename — so a crash mid-write never corrupts the checkpoint file.
- [ ] **AC-2.4** `CheckpointReader.load(path: string)` reads a JSONL file and returns a `Map<string, ShipUnitCluster>` of previously completed clusters.
- [ ] **AC-2.5** If the checkpoint file does not exist, `load()` returns an empty `Map` (first run).
- [ ] **AC-2.6** `HistoricalCalibrationConfig` gains an optional `runId?: string` field. When provided, the pipeline resolves the checkpoint path to `data/<projectSlug>/calibration-runs/<runId>/progress.jsonl`. When omitted, the pipeline generates a run ID from the current timestamp (e.g. `cal-2026-03-05T14-30-00`).
- [ ] **AC-2.7** At the start of the cluster loop, the pipeline loads existing checkpoint data. For each cluster, if the cluster ID is already in the checkpoint map, it is added directly to `shipUnitClusters` (skip reprocessing).
- [ ] **AC-2.8** After each cluster is successfully processed, the pipeline appends it to the checkpoint before proceeding to the next cluster.
- [ ] **AC-2.9** Skipped clusters (failures after retry exhaustion) are also recorded in the checkpoint with a `{ clusterId, timestamp, skipped: true, reason }` line, so re-runs do not re-attempt known-bad clusters unless the checkpoint file is manually cleared.
- [ ] **AC-2.10** Tier 1 unit tests verify: write + read round-trip, append semantics (multiple writes), load from non-existent file, skip of already-completed clusters, atomic write safety (simulate crash).
- [ ] **AC-2.11** Tier 3 boundary test verifies: a pipeline run that resumes from a partial checkpoint produces the same final `CalibrationRunOutput` as a full fresh run.

### AC-3 — Progress Callback

- [ ] **AC-3.1** `HistoricalCalibrationConfig` gains an optional `onProgress?: CalibrationProgressCallback` field.
- [ ] **AC-3.2** A new type `CalibrationProgressEvent` is defined with: `phase: CalibrationPhaseId`, `current: number`, `total: number`, `clusterId?: string`, `status?: 'processing' | 'completed' | 'skipped' | 'restored'`, `detail?: string`.
- [ ] **AC-3.3** `CalibrationPhaseId` is a union of identifiable pipeline phases: `'loading-tickets'`, `'clustering'`, `'loading-time-entries'`, `'attributing-time'`, `'calculating-dqs'`, `'processing-cluster'`, `'regression'`, `'complete'`.
- [ ] **AC-3.4** The pipeline emits progress events at each of the existing Step 1–7 boundaries and within the cluster loop (one event per cluster start, one per cluster completion/skip/restore).
- [ ] **AC-3.5** If `onProgress` is not provided, no progress events are emitted (backward-compatible).
- [ ] **AC-3.6** If `onProgress` throws, the error is caught and logged — it must never abort the pipeline.
- [ ] **AC-3.7** Tier 1 unit test verifies: events are emitted in the correct order, `current`/`total` values are consistent, throwing callback does not crash pipeline.

### AC-4 — CLI Wiring (`isv calibrate`)

- [ ] **AC-4.1** `isv calibrate --project <slug>` instantiates the full `HistoricalCalibrationPipeline` with configured adapters (Git, Jira XML, LLM, Time-Tracking) resolved from `data/<slug>/project-config.json`.
- [ ] **AC-4.2** `isv calibrate` accepts optional `--from <YYYY-MM>` and `--to <YYYY-MM>` flags for `periodStart` / `periodEnd`.
- [ ] **AC-4.3** `isv calibrate` accepts optional `--run-id <id>` to specify a checkpoint run ID for resume.
- [ ] **AC-4.4** Progress events are rendered to stdout as a concise, human-readable log: one line per event, showing phase, cluster ID (when applicable), and n/total progress (e.g. `[12/87] processing-cluster UNICEF-19106 — processing`).
- [ ] **AC-4.5** On completion, a summary is printed: total clusters, successful, skipped, skipped cluster IDs, and result file path.
- [ ] **AC-4.6** On failure (`Result.success === false`), the error is printed to stderr and the process exits with code 1.
- [ ] **AC-4.7** The final `CalibrationRunOutput` is written as JSON to `data/<slug>/calibration-runs/<runId>/result.json`.
- [ ] **AC-4.8** The `createHistoricalCalibrationFromConfig` factory function (analogous to `createIsvCalculationFromConfig`) is created in `packages/pipelines/src/historical-calibration/config-factory.ts` to construct the pipeline from a `ProjectConfig`.

### AC-5 — Per-Cluster Git Resource Release

- [ ] **AC-5.1** The cluster processing loop replaces `await this.gitClient.releaseAll()` with per-tree `await this.gitClient.release(tree)` for each worktree checked out for that cluster.
- [ ] **AC-5.2** A safety `releaseAll()` remains in the outermost `catch` of the entire `run()` method as a last-resort cleanup.
- [ ] **AC-5.3** Existing behavior is preserved: skipped clusters still properly release their resources.
- [ ] **AC-5.4** Tier 3 boundary test verifies that `release()` is called with the correct tree references (not `releaseAll()`) in the happy path.

---

## Technical Notes

### New Files

| File | Purpose |
| --- | --- |
| `packages/pipelines/src/shared/retry.ts` | Generic `retryAsync` with exponential backoff |
| `packages/pipelines/src/shared/checkpoint.ts` | JSONL checkpoint writer and reader |
| `packages/pipelines/src/historical-calibration/config-factory.ts` | Factory to construct pipeline from `ProjectConfig` (mirrors ISV calculation's `config-factory.ts`) |
| `packages/pipelines/src/historical-calibration/progress.ts` | `CalibrationProgressEvent`, `CalibrationPhaseId`, `CalibrationProgressCallback` type definitions |

### Modified Files

| File | Changes |
| --- | --- |
| `packages/pipelines/src/historical-calibration/port.ts` | Add `onProgress?`, `runId?` to `HistoricalCalibrationConfig` |
| `packages/pipelines/src/historical-calibration/pipeline.ts` | Wrap retryable calls with `retryAsync`, integrate checkpoint load/append, emit progress events, replace `releaseAll()` with per-tree `release()` |
| `packages/interfaces/cli/src/main.ts` | Replace `calibrate` stub with full pipeline instantiation, arg parsing, progress rendering |

### Affected Packages

| Package | Changes |
| --- | --- |
| `@isv/pipelines` | New shared utilities (retry, checkpoint), progress types, config factory, pipeline hardening |
| `@isv/interfaces/cli` | `isv calibrate` becomes functional |

### Dependencies

No new runtime dependencies. `retryAsync` uses `setTimeout` via `node:timers/promises`. Checkpoint I/O uses `node:fs` and `node:path` (already available).

### Design Decisions

- **JSONL over SQLite for Phase 1** — Keeps Phase 1 zero-dependency. SQLite (`better-sqlite3`) is deferred to Phase 2 where it becomes the persistent job/result store for parallel execution.
- **Checkpoint includes skipped clusters** — Prevents re-attempting known-bad clusters on resume, making re-runs faster and predictable. Operators can delete the checkpoint file to force a full re-run.
- **`retryAsync` is generic** — Reusable across ISV calculation pipeline and future pipelines, not coupled to calibration specifics.
- **Progress callback on config, not constructor** — Matches the `PipelineProgressCallback` pattern established in `IsvCalculationPipelinePort.run()`, keeping the pipeline port stateless.

### Estimation Guidance

| Area | Relative size |
| --- | --- |
| `retryAsync` utility + tests | Small |
| Checkpoint writer/reader + tests | Small–Medium |
| Progress types + pipeline wiring | Small–Medium |
| CLI `isv calibrate` wiring + config factory | Medium |
| Per-cluster `release()` refactor | Small |
| Integration / boundary tests | Medium |
