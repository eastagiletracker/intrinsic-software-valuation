# Historical Calibration Pipeline

## Purpose

Use Case 1: batch calibration across historical tickets. Orchestrates ticket clustering, T0 derivation, fact finding, gap analysis, valuation, time attribution, and Ship Rate regression.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `HistoricalCalibrationPipelinePort` — pipeline interface |
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

const result = await pipeline.run({ d3QualityFloor: 1 });
if (result.success) {
  console.log(result.data.shipRateHoursPerIsv);
  console.log(result.data.rSquared);
}
```

## Pipeline Steps

1. Load all tickets from Jira
2. Cluster tickets (parent + subtasks)
3. Load time entries from time tracking
4. Attribute time to clusters
5. Calculate DQS
6. For each cluster: checkout at T0 → fact finding → gap analysis → valuation
7. Assemble ShipUnitClusters
8. Run Ship Rate regression
