# Historical Calibration Pipeline

## Purpose

Use Case 1: batch calibration across historical tickets. Orchestrates ticket clustering, T0 derivation, fact finding, gap analysis, valuation, time attribution, Git change metric computation, and Ship Rate regression. Supports project + timeframe scoping, concurrent cluster processing, checkpoint/resume, retry with exponential backoff, LLM rate limiting, and live progress reporting.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `HistoricalCalibrationPipelinePort` — pipeline interface, `HistoricalCalibrationConfig` |
| `pipeline.ts` | Orchestration implementation + factory (PQueue-based concurrent processing) |
| `progress.ts` | `CalibrationProgressEvent`, `CalibrationPhaseId`, `CalibrationProgressCallback` types |
| `config-factory.ts` | `createHistoricalCalibrationFromConfig` — construct pipeline from project-config.json |
| `index.ts` | Public re-exports |

## How to use

### Dependency-injection factory (for tests and direct usage)

```typescript
import { createHistoricalCalibrationPipeline } from "@isv/pipelines";

const pipeline = createHistoricalCalibrationPipeline({
  ticketClient,
  gitClient,
  llmClient,
  timeTrackingClient,
  statusQuoMiner,
  architectureScanner,
  gapAnalyzer,
  valuation,
  calibration,
  runStore, // optional: SqliteRunStore for persistence
});

// Run with concurrency, LLM rate limiting, and progress reporting
const result = await pipeline.run({
  projectSlug: "my-project",
  periodStart: "2025-01",
  periodEnd: "2026-02",
  d3QualityFloor: 1,
  runId: "cal-2026-03-05T14-30-00",
  concurrency: 3,       // cluster workers (default: 3)
  llmConcurrency: 2,    // max simultaneous LLM calls (default: 2)
  taskTimeoutMs: 300000, // per-task timeout (default: 5 min)
  onProgress: (event) => console.log(event.phase, event.current, event.total),
});
if (result.success) {
  console.log(result.data.result.shipRateHoursPerIsv);
  console.log(result.data.result.rSquared);
  console.log(result.data.clusters.length);
  console.log(result.data.skippedClusters);
}
```

### Config-based factory (for CLI)

```typescript
import { createHistoricalCalibrationFromConfig } from "@isv/pipelines";

const factoryResult = await createHistoricalCalibrationFromConfig(rawProjectConfig);
if (factoryResult.success) {
  const { pipeline, cleanup } = factoryResult.data;
  try {
    const result = await pipeline.run({ projectSlug: "my-project", concurrency: 5 });
  } finally {
    await cleanup();
  }
}
```

## Pipeline Steps

1. Resolve period (defaults to 18-month window ending at current month)
2. Load tickets from Jira (filtered by timeframe)
3. Cluster tickets (parent + subtasks)
4. Load time entries from time tracking (filtered by timeframe)
5. Attribute time to clusters
6. Calculate DQS
7. For each cluster (concurrently via PQueue): checkout at T0 → fact finding → gap analysis → valuation (with retry + LLM gate)
8. Compute Git change metrics (entropy, complexity delta, intensity score)
9. Assemble ShipUnitClusters (with RunStore + JSONL checkpoint persistence)
10. Run calibration regression (returns `CalibrationRunOutput` with full clusters, residuals, and skipped cluster reporting)

## Resilience Features

- **Concurrency**: Clusters processed concurrently via `PQueue` with configurable `concurrency` (default: 3)
- **LLM Semaphore**: `architectureScanner.scan()` and `gapAnalyzer.analyze()` gated by `createLlmGate` (default: 2 concurrent LLM calls)
- **Retry**: `checkoutAll()`, `architectureScanner.scan()`, and `gapAnalyzer.analyze()` are wrapped with `retryAsync` (backed by `p-retry`, exponential backoff, 3 retries by default)
- **RunStore**: SQLite-based run/cluster state persistence; primary checkpoint mechanism (Phase 2)
- **JSONL Checkpoint**: Human-readable JSONL file written alongside RunStore for debugging
- **Progress**: Optional `onProgress` callback emits `CalibrationProgressEvent` at each pipeline phase and per-cluster
- **Per-cluster release**: Git worktrees are released per-cluster instead of globally
- **SIGINT handling**: Pauses queue on Ctrl+C, waits for in-flight tasks, persists state
