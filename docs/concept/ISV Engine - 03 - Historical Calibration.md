# ISV Engine: Historical Calibration

## Purpose and Context

After the ISV Engine calculates structural complexity as an abstract ISV value, calibration translates this value into an empirically grounded rate.

The goal is to determine the Ship Rate: a stable conversion between ISV points and actual invested time. Monetary valuation in Euros remains a separate, decoupled step.

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

Generated object per story or task after aggregation:

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
    "isvScore": 12.5,
    "confidence": 0.92
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

## Calibration Workflow (Implementation Path)

1. Cluster-centric ingest based on ticket lifecycle.
2. Triple matching: baseline checkout, ISV run, and Git analysis.
3. Reconciliation and overhead allocation.
4. Statistical calibration and `shipRateHoursPerIsv` calculation.

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