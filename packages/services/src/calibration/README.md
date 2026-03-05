# Calibration Service

## Purpose

Historical calibration: clusters tickets, attributes time entries to clusters, calculates Data Quality Score, and runs Ship Rate regression (ISV vs hours). Provides multivariate OLS regression with factor-level diagnostics, normality assessment, outlier detection, reliability summary, and formula validation.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `CalibrationPort` — service interface |
| `service.ts` | Implementation: clustering, 5 attribution strategies, DQS, multivariate regression, diagnostics, outlier detection, normality, reliability, formula validation |
| `statistics.ts` | Statistical utilities: OLS regression, partial correlation, Shapiro-Wilk/KS normality tests, confidence intervals, Shannon entropy, change intensity score |
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

// 4. Run regression (returns full CalibrationResult with diagnostics)
const result = calibration.calibrate(shipUnitClusters);
// result.data includes: shipRateHoursPerIsv, shipRateExclOutliers,
// rSquared, adjustedRSquared, factorDiagnostics, reliability,
// outliers, normalityAssessment, formulaValidation
```

## Attribution Strategies

1. **Direct** — single ticket ID matches a cluster member
2. **Cluster match** — multiple IDs all map to the same cluster
3. **Multi-ID split** — IDs map to different clusters; hours split equally
4. **Threshold / KBV** — ticket IDs present but no matching cluster
5. **No-ID** — no ticket IDs detected; classified as unlinked overhead

## Regression Modes

- **Multivariate OLS** — when sample size ≥ 2× number of features (18 clusters): uses 6 ISV factors + 3 Git metrics as independent variables
- **Simple linear regression** — fallback when sample is too small: uses ISV score vs total hours
