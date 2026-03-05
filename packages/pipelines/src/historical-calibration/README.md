# Historical Calibration Pipeline

## Purpose

Use Case 1: batch calibration across historical tickets. Orchestrates ticket clustering, T0 derivation, fact finding, gap analysis, valuation, time attribution, Git change metric computation, and Ship Rate regression. Supports project + timeframe scoping.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `HistoricalCalibrationPipelinePort` — pipeline interface, `HistoricalCalibrationConfig` |
| `pipeline.ts` | Orchestration implementation + factory |
| `index.ts` | Public re-exports |

## How to use

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

// Run with project + timeframe scoping
const result = await pipeline.run({
  projectSlug: "my-project",
  periodStart: "2025-01",
  periodEnd: "2026-02",
  d3QualityFloor: 1,
});
if (result.success) {
  console.log(result.data.result.shipRateHoursPerIsv);
  console.log(result.data.result.rSquared);
  console.log(result.data.clusters.length);
  console.log(result.data.skippedClusters);
}
```

## Pipeline Steps

1. Resolve period (defaults to 18-month window ending at current month)
2. Load tickets from Jira (filtered by timeframe)
3. Cluster tickets (parent + subtasks)
4. Load time entries from time tracking (filtered by timeframe)
5. Attribute time to clusters
6. Calculate DQS
7. For each cluster: checkout at T0 → fact finding → gap analysis → valuation
8. Compute Git change metrics (entropy, complexity delta, intensity score)
9. Assemble ShipUnitClusters
10. Run calibration regression (returns `CalibrationRunOutput` with full clusters, residuals, and skipped cluster reporting)
