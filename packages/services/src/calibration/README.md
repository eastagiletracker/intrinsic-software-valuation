# Calibration Service

## Purpose

Historical calibration: clusters tickets, attributes time entries to clusters, calculates Data Quality Score, and runs Ship Rate regression (ISV vs hours).

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `CalibrationPort` — service interface |
| `service.ts` | Implementation: clustering, 5 attribution strategies, DQS, regression |
| `index.ts` | Public re-exports |

## How to use

```typescript
import { createCalibrationService } from "@isv/services";

const calibration = createCalibrationService();

// 1. Cluster tickets
const clusters = calibration.clusterTickets(tickets);

// 2. Attribute time entries
const attributed = calibration.attributeTime(timeEntries, clusters);

// 3. Calculate DQS
const dqs = calibration.calculateDqs(attributed);

// 4. Run regression
const result = calibration.calibrate(shipUnitClusters);
```

## Attribution Strategies

1. **Direct** — single ticket ID matches a cluster member
2. **Cluster match** — multiple IDs all map to the same cluster
3. **Multi-ID split** — IDs map to different clusters; hours split equally
4. **Threshold / KBV** — ticket IDs present but no matching cluster
5. **No-ID** — no ticket IDs detected; classified as unlinked overhead
