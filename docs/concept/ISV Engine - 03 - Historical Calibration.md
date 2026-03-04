# ISV Engine: Historical Calibration

## Purpose and Context

After the ISV Engine calculates structural complexity as an abstract ISV value, calibration translates this value into an empirically grounded rate.

The goal is to determine the Ship Rate: a stable conversion between ISV points and actual invested time. Monetary valuation in Euros remains a separate, decoupled step.

Calibration also serves as an **empirical confidence check** for the static ISV formula. By preserving full factor-level detail for every calibrated cluster, the system can optionally surface statistical diagnostics that reveal whether the formula's factor weights and structure are realistic relative to actual invested effort. The formula itself is never adjusted automatically — diagnostics inform deliberate, human-decided revisions (see Formula Versioning in [ISV Engine - 02 - Valuation](ISV%20Engine%20-%2002%20-%20Valuation.md)).

## Input Data (Triangulation)

Calibration uses three data streams from the previous 18 months.

### Jira Ticket and Ticket Clustering (Target State)

To evaluate realistic ship units, the process groups related tickets into ticket clusters instead of evaluating isolated items.

- Hierarchical aggregation: A story or task and its subtasks are combined into one logical unit.
- `T0` logic: Technological starting point is derived from the first relevant Git commit (preferred) or a Jira status transition.

### Code at Time X (Baseline)

The Fact Finder performs a historical Git checkout to the exact baseline commit (`T0`) for each cluster.

### Time Tracking (Ground Truth)

- Metric: Sum of all logged hours across all IDs in the cluster, independent of booking period.

### Code Changes (Code Change Miner)

Aggregates volume and intensity signals such as LoC, complexity, and distribution entropy.

### Scope Definition and Filter Rules

- No epic aggregation: The ship unit is a story or task including subtasks.
- Ignore links: Only explicit parent-subtask hierarchy is considered.
- Knowledge-Based Value (KBV): Captures hours without code references and hours without explicit ticket references.

## Completeness Guarantee and Reconciliation

To achieve full congruence between time tracking and value model, every logged hour is categorized.

- Reconciliation runs monthly.
- Data Quality Score (DQS) trend is tracked monthly: $\frac{Matched + KBV}{Total}$.
- Periods with `DQS < 85%` are flagged through confidence filtering.

## Monetary Valuation

Monetary valuation combines feature value, knowledge value, and general overhead into a total budget that matches logged hours.

## Objective: Stable Empirical Correlation

The target is $R^2 > 0.7$ by including change intensity, complexity, and distribution entropy.

## Interface Specifications (Data Contracts)

### Input: ShipUnitCluster (Schema)

Generated object per story or task after aggregation. The `isvAnalysis` block carries the **full factor composition** (all six input factors, intermediate breakdown, and formula version) alongside the final score. This preserves per-factor granularity for statistical validation during calibration without altering the static ISV formula itself.

```json
{
  "clusterId": "PROJ-123",
  "ids": ["PROJ-123", "PROJ-1231", "PROJ-1232"],
  "metadata": {
    "type": "Story",
    "storyPoints": 8.0,
    "timestamp_T0": "2024-03-01T10:00:00Z"
  },
  "isvAnalysis": {
    "formulaVersion": "3.4",
    "isvScore": 12.5,
    "confidence": 0.92,
    "factors": {
      "A1_Data": 2,
      "A2_UX": 2,
      "B1_Logic": 3,
      "C1_Integration": 1,
      "C2_State": 1,
      "D3_Quality": 1
    },
    "breakdown": {
      "poValue": 7,
      "archFactor": 1,
      "qualityMultiplier": 1
    }
  },
  "metrics": {
    "totalHours": 32.5,
    "gitChanges": {
      "locAdded": 450,
      "locDeleted": 120,
      "filesChanged": 14,
      "distributionEntropy": 3,
      "cyclomaticComplexityDelta": 42,
      "changeIntensityScore": 0.85
    }
  }
}
```

## Factor-Level Diagnostics (Advanced, Optional)

Because each `ShipUnitCluster` now carries the full factor composition, calibration can optionally produce **factor-level diagnostics** in addition to the scalar Ship Rate. These diagnostics validate the static formula against empirical data without modifying it.

Diagnostics are computed per factor across all clusters in the calibration sample:

- **Partial correlation** ($r$): Correlation of each factor with actual hours while controlling for all other factors. Reveals which factors carry real explanatory power.
- **Weight** ($\beta$): Standardized regression coefficient. Indicates the empirical direction and magnitude of each factor's influence on time invested.
- **p-value**: Statistical significance of each factor's contribution. Factors with $p > 0.05$ may not carry meaningful signal.

Diagnostics output is an array of per-factor entries:

```json
{
  "factorDiagnostics": [
    {
      "factor": "A1_Data",
      "partialCorrelation": 0.65,
      "weight": 0.42,
      "pValue": 0.001
    },
    {
      "factor": "C2_State",
      "partialCorrelation": 0.31,
      "weight": 0.18,
      "pValue": 0.12
    }
  ]
}
```

### Interpretation Rules

- Diagnostics **inform** human decisions about formula revisions; they never trigger automatic adjustments.
- A factor with consistently negligible partial correlation across multiple calibration runs may warrant review of its scale definitions.
- A factor with unexpectedly high weight relative to its ISV formula position (additive vs. multiplicative) may indicate the formula structure under- or overweights that dimension.
- Any formula change resulting from diagnostics constitutes a new formula version (see [ISV Engine - 02 - Valuation](ISV%20Engine%20-%2002%20-%20Valuation.md), Formula Versioning).

## Calibration Workflow (Implementation Path)

1. Cluster-centric ingest based on ticket lifecycle.
2. Triple matching: baseline checkout, ISV run, and Git analysis.
3. Reconciliation and overhead allocation.
4. Statistical calibration and `shipRateHoursPerIsv` calculation.
5. *(Optional)* Factor-level diagnostics: multivariate regression on per-factor data across all clusters.

## Data Standard and Parsing Logic for Time Tracking

A standardized parser transforms raw time logs (L0) into usable investment data.

### Target Format: StandardizedTimeEntry

```json
{
  "entryId": "UUID-999",
  "timestamp": "2024-03-05T14:00:00Z",
  "durationHours": 4.5,
  "rawComment": "Work on PROJ-123 and PROJ-124 Refactoring",
  "detectedIds": ["PROJ-123", "PROJ-124"],
  "attributionType": "MULTI_ID_SPLIT"
}
```

### ID Attribution Strategies (Prioritization)

- Direct match: Exactly one known ID in comment means full attribution.
- Cluster match: Subtask ID maps automatically to parent cluster.
- Multi-ID split: If IDs from different clusters appear, distribute hours evenly by default.
- Threshold rule: More than 3 IDs in a short comment becomes `UNLINKED_OVERHEAD`.
- No-ID catch-all: Entries without recognizable IDs go into period KBV.

### Exception Handling

- Invalid ID match: Regex match without Jira existence is logged as `UNLINKED_OVERHEAD`.
- Ambivalent entries: Entries without IDs are classified as KBV; no semantic review of comments is performed.

### Data Cleaning (L1 Layer)

Before correlation analysis, remove zero-performance entries:

- Entries below `0.1h` (rounding artifacts).
- Weekend or holiday entries without Git activity (likely late bookings without architecture context).
