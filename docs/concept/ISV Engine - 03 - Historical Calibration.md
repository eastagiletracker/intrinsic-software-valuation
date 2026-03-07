# ISV Engine: Historical Calibration

## Purpose and Context

After the ISV Engine calculates structural complexity as an abstract ISV value, calibration translates this value into an empirically grounded rate.

The goal is to determine the Ship Rate: a stable conversion between ISV points and actual invested time. Monetary valuation in Euros remains a separate, decoupled step.

Calibration also serves as an **empirical confidence check** for the static ISV formula. By preserving full factor-level detail for every calibrated cluster, the system surfaces statistical diagnostics that reveal whether the formula's factor weights and structure are realistic relative to actual invested effort. The formula itself is never adjusted automatically — diagnostics inform deliberate, human-decided revisions (see Formula Versioning in [ISV Engine - 02 - Valuation](ISV%20Engine%20-%2002%20-%20Valuation.md)).

For visualization, report structure, static JSON storage, and UI routing, see [ISV Engine - 03 - Historical Calibration Report](ISV%20Engine%20-%2003%20-%20Historical%20Calibration%20Report.md).

## Calibration Scope

Every calibration run is scoped to a **named project** and a **calendar window**.

- **Project**: Identified by a `data/<project>/project-config.json` entry. Determines which Jira project key, Git repositories, and time-tracking source files are included.
- **Timeframe**: Start month and end month (inclusive). Default is the previous 18 months. The user can override this to any arbitrary range (e.g. `2025-10` to `2026-02`).
- Only tickets whose resolution date (or, if unresolved, creation date) falls within the window are included.
- Only time entries whose booking timestamp falls within the window are included.
- Git checkouts use the per-cluster `T0` timestamp regardless of the window; the window filters which clusters enter the sample.

The pipeline configuration therefore requires at minimum: `projectSlug`, `periodStart`, `periodEnd`.

## Input Data (Triangulation)

Calibration uses three data streams scoped to the configured project and timeframe.

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

### Log-Transformed Regression

The regression is performed on $\ln(\text{hours})$ rather than raw hours:

$$\ln(\text{hours}) = \beta_0 + \beta_1 \cdot A1 + \ldots + \beta_9 \cdot \text{changeIntensity} + \varepsilon$$

**Rationale**: Effort distributions are typically right-skewed — many small clusters, few large ones. OLS on raw hours produces heavy-tailed, asymmetric residuals that violate normality. The log-transform compresses the scale, stabilises variance, and yields residuals that are closer to normal.

- **Ship Rate** remains a simple linear slope (hours / ISV score), computed outside the log-regression for direct interpretability. The log-transform only affects R², factor diagnostics, and the normality assessment.
- Clusters with negligible booked time (< 0.01 h) are floored at 0.01 h before transformation to avoid $\ln(0)$.
- **Predictions** back-transformed via $\exp(\hat{y})$ so that cluster residuals are reported in real hours.
- The normality test (Shapiro-Wilk / Kolmogorov-Smirnov) runs on **log-space residuals** where the OLS normality assumption applies.

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

## Factor-Level Diagnostics

Because each `ShipUnitCluster` carries the full factor composition, calibration produces **factor-level diagnostics** alongside the scalar Ship Rate. These diagnostics validate the static formula against empirical data without modifying it. They are a mandatory output of every calibration run.

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
- Factor diagnostics are always computed and included in the calibration output. They are not optional.

## Distribution Analysis and Reliability Transparency

A scalar Ship Rate and R² alone are insufficient to earn trust in the calibration. The system must make the **shape and quality** of the underlying data visible.

### Per-Cluster Residuals

For every `ShipUnitCluster` in the sample, the calibration stores the **residual** (actual hours minus predicted hours from the regression model). This enables:

- Identification of clusters where ISV dramatically over- or under-predicts effort.
- Drill-down into outlier clusters to understand why the model fails (e.g. knowledge work, unusual code patterns, poor time attribution).

### Normality Assessment (Normalverteilung)

The distribution of residuals is tested for approximate normality. A well-fitting linear model should produce residuals that are roughly normally distributed around zero.

- **Shapiro-Wilk test** (for samples < 50) or **Kolmogorov-Smirnov test** (for larger samples): reports test statistic and p-value.
- **Skewness and kurtosis** of the residual distribution.
- If residuals are significantly non-normal ($p < 0.05$), the calibration flags this and reports possible causes (e.g. heavy-tailed distribution from a few extreme clusters).

### Outlier Detection

Clusters with |standardized residual| > 2 are flagged as **statistical outliers**. The calibration reports:

- Number and percentage of outlier clusters.
- The outlier cluster IDs with their residual values and a human-readable reason label (e.g. `HIGH_KBV_RATIO`, `ZERO_GIT_CHANGES`, `EXTREME_HOURS`).
- Ship Rate is reported **both with and without outliers** so that the impact of extreme data points is transparent.

### Confidence and Reliability Summary

The calibration output includes a structured reliability block:

- **Sample size** and **effective sample size** (after outlier exclusion).
- **Standard error** of the Ship Rate estimate.
- **95% confidence interval** for the Ship Rate.
- **Coefficient of variation** ($\frac{\sigma}{\mu}$) of hours-per-ISV across clusters — lower is more stable.
- **DQS** (Data Quality Score) for the period.
- **Normality flag**: pass / warning / fail based on the residual distribution test.

This block is designed so that a reviewer can quickly assess: "How much can I trust this Ship Rate?"

## Formula Validation

Beyond the Ship Rate, calibration answers the question: **Does the ISV formula structure match real-world effort patterns?**

### Validity Statements

The calibration output includes structured natural-language statements derived from the statistical results:

- **Overall fit**: "The ISV formula explains X% of variance in actual hours (R² = 0.XX). This is [strong / moderate / weak] evidence that the model captures real effort drivers."
- **Ship Rate reliability**: "The Ship Rate of Y hours/ISV has a 95% confidence interval of [A, B]. The coefficient of variation is Z%, indicating [high / moderate / low] stability."
- **Data quality**: "DQS is X%. Y% of total hours could be attributed to specific clusters; Z% are KBV; W% remain unlinked overhead."

### Factor Correlation Ranking

Using the mandatory factor-level diagnostics (partial correlation, $\beta$-weight, p-value), the output ranks all factors by their empirical predictive power:

- **Ranking table**: Factors sorted by |partial correlation| descending, with significance flag ($p < 0.05$ = significant, $p < 0.01$ = highly significant).
- **Formula-vs-reality comparison**: For each factor, compare its position in the ISV formula (additive component A/B vs. multiplicative component C/D) against its empirical weight. Flag mismatches where a multiplicative factor has low empirical significance, or an additive factor dominates.
- **Composite regression features**: In addition to the six ISV factors, the regression includes Git change metrics (distribution entropy, complexity delta, change intensity) as features. If a Git metric has higher partial correlation than an ISV factor, this is flagged for review.

### Recommendations Block

- Factors with $p > 0.10$ across multiple calibration runs: "Factor X shows no statistically significant correlation with effort. Consider reviewing its scale definitions."
- Factors with unexpectedly high $\beta$: "Factor Y explains more variance than its formula position suggests. The formula may underweight this dimension."
- Any formula change resulting from these insights constitutes a new formula version (see [ISV Engine - 02 - Valuation](ISV%20Engine%20-%2002%20-%20Valuation.md), Formula Versioning).

## Calibration Workflow (Implementation Path)

1. Scope resolution: load project config, resolve timeframe, filter tickets and time entries.
2. Cluster-centric ingest based on ticket lifecycle.
3. Triple matching: baseline checkout, ISV run, and Git analysis.
4. Reconciliation and overhead allocation.
5. Statistical calibration and `shipRateHoursPerIsv` calculation.
6. Per-cluster residual computation and outlier detection.
7. Distribution analysis: normality test, skewness, kurtosis.
8. Factor-level diagnostics: multivariate regression on per-factor data across all clusters.
9. Formula validation: validity statements, factor ranking, recommendations.
10. Reliability summary: confidence interval, standard error, coefficient of variation.

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
