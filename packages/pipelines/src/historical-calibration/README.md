# Historical Calibration Pipeline

## Purpose

Use Case 1: batch calibration across historical tickets. Orchestrates ticket clustering, T0 derivation, fact finding, gap analysis, valuation, time attribution, Git change metric computation, and Ship Rate regression. Supports project + timeframe scoping, checkpoint/resume, retry with exponential backoff, and live progress reporting.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `HistoricalCalibrationPipelinePort` — pipeline interface, `HistoricalCalibrationConfig` |
| `pipeline.ts` | Orchestration implementation + factory |
| `progress.ts` | `CalibrationProgressEvent`, `CalibrationPhaseId`, `CalibrationProgressCallback` types |
| `config-factory.ts` | `createHistoricalCalibrationFromConfig` — construct pipeline from project-config.json |
| `report-writer.ts` | `writeCalibrationReport` — persist `CalibrationRunOutput` as JSON report file |
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
});

// Run with project + timeframe scoping, progress callback, and checkpoint resume
const result = await pipeline.run({
  projectSlug: "my-project",
  periodStart: "2025-01",
  periodEnd: "2026-02",
  d3QualityFloor: 1,
  runId: "cal-2026-03-05T14-30-00",
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
    const result = await pipeline.run({ projectSlug: "my-project" });
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
7. For each cluster: checkout at T0 → fact finding → gap analysis → valuation (with retry)
8. Compute Git change metrics (entropy, complexity delta, intensity score)
9. Assemble ShipUnitClusters (with checkpoint persistence)
10. Run calibration regression (returns `CalibrationRunOutput` with full clusters, residuals, and skipped cluster reporting)

## Resilience Features

- **Retry**: `checkoutAll()`, `architectureScanner.scan()`, and `gapAnalyzer.analyze()` are wrapped with `retryAsync` (exponential backoff, 3 retries by default)
- **Checkpoint**: Completed and skipped clusters are persisted to a JSONL file; re-runs skip already-processed work
- **Progress**: Optional `onProgress` callback emits `CalibrationProgressEvent` at each pipeline phase and per-cluster
- **Per-cluster release**: Git worktrees are released per-cluster instead of globally, preparing for future parallelism
