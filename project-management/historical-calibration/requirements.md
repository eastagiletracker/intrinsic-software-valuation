# Historical Calibration — Full Implementation

## User Story

As a **Technical Product Owner / ISV Analyst**, I want **to run a historical calibration scoped to a specific project and timeframe that produces a statistically rigorous Ship Rate, per-factor diagnostics, distribution analysis, outlier transparency, and formula validation** so that I can **trust the calibration numbers, understand where the ISV formula holds and where it breaks down, and make informed decisions about formula adjustments before transitioning from Euro-based to ISV-based effort measurement**.

---

## Scope

### In scope

- Project + timeframe scoping for the calibration pipeline
- Timeframe-aware ticket loading (extend `TicketQuery` with date range)
- Timeframe-aware time entry loading (wire existing `TimeTrackingQuery.timeframe` into the pipeline)
- Computation of the three stubbed Git change metrics (entropy, complexity delta, intensity score)
- Multivariate regression replacing simple linear regression (6 ISV factors + 3 Git metrics as features)
- Mandatory factor-level diagnostics (partial correlation, β-weight, p-value per factor)
- Per-cluster residual computation and storage
- Normality assessment of residuals (Shapiro-Wilk / Kolmogorov-Smirnov)
- Outlier detection with standardized residuals
- Ship Rate reported with and without outliers
- Confidence and reliability summary (standard error, 95% CI, coefficient of variation, normality flag)
- Formula validation output (validity statements, factor ranking, recommendations)
- Extended `CalibrationResult` domain schema for all new output fields
- Per-cluster result persistence (full `ShipUnitCluster[]` returned alongside `CalibrationResult`)
- Tests at Tier 1–3 per QA strategy

### Out of scope

- Automatic formula adjustment (diagnostics inform human decisions only)
- Web UI integration for calibration (remains CLI-triggered)
- Deployment or containerization
- Real-time / streaming calibration updates

---

## Reference Documents

- [ISV Engine - 03 - Historical Calibration](../../docs/concept/ISV%20Engine%20-%2003%20-%20Historical%20Calibration.md) — Authoritative concept
- [ISV Engine - 02 - Valuation](../../docs/concept/ISV%20Engine%20-%2002%20-%20Valuation.md) — Formula and versioning
- [QA Strategy](../../docs/qa-strategy.md) — Testing tiers

---

## Acceptance Criteria

### AC-1 — Project + Timeframe Scoping

- [ ] **AC-1.1** `HistoricalCalibrationConfig` accepts `projectSlug: string`, `periodStart: string` (ISO month, e.g. `"2025-10"`), `periodEnd: string` (ISO month, e.g. `"2026-02"`)
- [ ] **AC-1.2** `periodStart` and `periodEnd` default to an 18-month window ending at the current month when omitted
- [ ] **AC-1.3** The pipeline resolves `projectSlug` to a `data/<projectSlug>/project-config.json` and loads the project's Jira, Git, and time-tracking configuration from it
- [ ] **AC-1.4** Only tickets whose resolution date (or creation date if unresolved) falls within `[periodStart, periodEnd]` enter the calibration sample
- [ ] **AC-1.5** Only time entries whose booking timestamp falls within `[periodStart, periodEnd]` are loaded
- [ ] **AC-1.6** Git checkouts still use the per-cluster T0 timestamp (not the period window)

### AC-2 — Ticket Client Date Range Support

- [ ] **AC-2.1** `TicketQuery` gains a new mode or an optional `timeframe: { start, end }` field that allows filtering tickets by resolution/creation date
- [ ] **AC-2.2** The Jira XML adapter implements the date filter (in-memory filtering after parse is acceptable for the XML source)
- [ ] **AC-2.3** Existing `TicketQuery` modes (`all`, `byTicketNumbers`, `withSubtasks`) continue to work unchanged
- [ ] **AC-2.4** Tier 2 adapter test verifies date-range filtering against a fixture

### AC-3 — Time Entry Timeframe Wiring

- [ ] **AC-3.1** The pipeline passes `{ timeframe: { start: periodStart, end: periodEnd } }` to `timeTrackingClient.getTimeSheet()` instead of calling it without arguments
- [ ] **AC-3.2** If `periodStart` / `periodEnd` are omitted from config, the pipeline omits the timeframe query (loads all entries — backward-compatible)

### AC-4 — Git Change Metrics

- [ ] **AC-4.1** `distributionEntropy` is computed: Shannon entropy of lines-changed-per-file distribution across all commits in the cluster
- [ ] **AC-4.2** `cyclomaticComplexityDelta` is computed: net change in cyclomatic complexity between T0 and the latest commit in the cluster's timeframe (requires static analysis at T0 and at HEAD or resolution point)
- [ ] **AC-4.3** `changeIntensityScore` is computed: composite score (0–1) combining normalized LOC, distribution entropy, and complexity delta signals
- [ ] **AC-4.4** Hardcoded zeros in the pipeline are replaced with actual computed values
- [ ] **AC-4.5** Tier 1 unit test for entropy calculation, complexity delta, and intensity score composition

### AC-5 — Multivariate Regression

- [ ] **AC-5.1** `calibrate()` performs multivariate OLS regression with dependent variable `totalHours` and independent variables: `A1_Data`, `A2_UX`, `B1_Logic`, `C1_Integration`, `C2_State`, `D3_Quality`, `distributionEntropy`, `cyclomaticComplexityDelta`, `changeIntensityScore`
- [ ] **AC-5.2** The regression returns overall R², adjusted R², and per-feature coefficients
- [ ] **AC-5.3** The simple scalar Ship Rate (`hours / ISV`) is still computed alongside the multivariate model for backward compatibility
- [ ] **AC-5.4** If the sample size is too small for multivariate regression (< 2× number of features), the service falls back to simple linear regression and flags this in the output
- [ ] **AC-5.5** Tier 1 unit test verifies multivariate regression with a known dataset (minimum 15 synthetic data points)

### AC-6 — Mandatory Factor-Level Diagnostics

- [ ] **AC-6.1** For each of the 6 ISV factors and 3 Git metrics, the calibration computes: partial correlation, standardized β-weight, and p-value
- [ ] **AC-6.2** `factorDiagnostics` in `CalibrationResult` is no longer optional — it is always populated
- [ ] **AC-6.3** The `FactorDiagnosticSchema` is extended to also cover Git metric features (or a parallel `RegressionFeatureDiagnostic` schema is introduced)
- [ ] **AC-6.4** Tier 1 unit test verifies partial correlation computation against a known dataset

### AC-7 — Per-Cluster Residuals

- [ ] **AC-7.1** For every `ShipUnitCluster` in the sample, the calibration computes: `predictedHours` (from regression model), `residual` (actual − predicted), `standardizedResidual` (residual / residual standard deviation)
- [ ] **AC-7.2** A new domain schema `ClusterResidual` (or an extension of `ShipUnitCluster`) stores these per-cluster values
- [ ] **AC-7.3** Residuals are included in the calibration output (either as part of an extended result or as a separate array)

### AC-8 — Normality Assessment

- [ ] **AC-8.1** Residuals are tested for normality using Shapiro-Wilk (n < 50) or Kolmogorov-Smirnov (n ≥ 50)
- [ ] **AC-8.2** The output includes: test name, test statistic, p-value, skewness, kurtosis
- [ ] **AC-8.3** A normality flag is derived: `pass` (p ≥ 0.05), `warning` (0.01 ≤ p < 0.05), `fail` (p < 0.01)
- [ ] **AC-8.4** Tier 1 unit test verifies Shapiro-Wilk implementation against a known normal and non-normal sample

### AC-9 — Outlier Detection

- [ ] **AC-9.1** Clusters with |standardized residual| > 2 are flagged as outliers
- [ ] **AC-9.2** Each outlier includes: `clusterId`, `residual`, `standardizedResidual`, and a reason label (e.g. `UNCLASSIFIED`, `ZERO_GIT_CHANGES`, `EXTREME_HOURS`, `NEAR_ZERO_HOURS`)
- [ ] **AC-9.3** The Ship Rate is reported both with all clusters and with outliers excluded
- [ ] **AC-9.4** The output includes: outlier count, outlier percentage, and the list of outlier entries
- [ ] **AC-9.5** Tier 1 unit test with a synthetic dataset containing known outliers

### AC-10 — Confidence and Reliability Summary

- [ ] **AC-10.1** The calibration output includes a `reliability` block with: `sampleSize`, `effectiveSampleSize` (after outlier exclusion), `standardError` of Ship Rate, `confidenceInterval95` (lower, upper bounds), `coefficientOfVariation`, `dataQualityScore`, `normalityFlag`
- [ ] **AC-10.2** A new domain schema `ReliabilitySummary` is defined for this block
- [ ] **AC-10.3** Tier 1 unit test verifies confidence interval calculation (analytical or bootstrap)

### AC-11 — Formula Validation Output

- [ ] **AC-11.1** The output includes structured validity statements: overall fit assessment (`strong` / `moderate` / `weak` based on R² thresholds), Ship Rate reliability assessment, data quality assessment
- [ ] **AC-11.2** The output includes a factor ranking: all 6 ISV factors + 3 Git metrics sorted by |partial correlation| descending, with significance flags
- [ ] **AC-11.3** The output flags formula-vs-reality mismatches: multiplicative factors (C1, C2, D3) with low empirical weight, additive factors (A1, A2, B1) with dominant weight, Git metrics outperforming ISV factors
- [ ] **AC-11.4** The output includes a recommendations array: actionable text strings derived from the statistical results (e.g. "Factor C2_State shows no significant correlation — review scale definitions")
- [ ] **AC-11.5** A new domain schema `FormulaValidation` is defined with sub-schemas for statements, ranking, and recommendations

### AC-12 — Extended CalibrationResult Schema

- [ ] **AC-12.1** `CalibrationResultSchema` gains mandatory fields: `factorDiagnostics` (no longer optional), `reliability: ReliabilitySummary`, `outliers: OutlierReport`, `normalityAssessment: NormalityAssessment`, `formulaValidation: FormulaValidation`
- [ ] **AC-12.2** `CalibrationResultSchema` gains a new field: `shipRateExclOutliers: number` (Ship Rate after outlier exclusion)
- [ ] **AC-12.3** A new type `CalibrationRunOutput` (or extension of `CalibrationResult`) includes `clusters: ShipUnitCluster[]` alongside the aggregated result, so per-cluster data is available for drill-down
- [ ] **AC-12.4** All new schemas pass Zod parse/safeParse for valid and invalid input (Tier 1 schema tests)

### AC-13 — Pipeline Return Value

- [ ] **AC-13.1** The pipeline returns `Result<CalibrationRunOutput>` containing both the `CalibrationResult` and the full `ShipUnitCluster[]` array
- [ ] **AC-13.2** Each `ShipUnitCluster` in the returned array includes its residual and outlier flag
- [ ] **AC-13.3** Skipped clusters are reported separately with their skip reason

### AC-14 — Tests

- [ ] **AC-14.1** All new statistical functions (multivariate OLS, partial correlation, Shapiro-Wilk, confidence interval, outlier detection) have Tier 1 unit tests with known-answer datasets
- [ ] **AC-14.2** The calibration service has an updated Tier 3 boundary test covering: multivariate regression, factor diagnostics, residuals, outliers, normality, reliability summary, formula validation
- [ ] **AC-14.3** The pipeline has an updated Tier 3 boundary test covering: project + timeframe scoping, extended CalibrationRunOutput, skipped cluster reporting
- [ ] **AC-14.4** All existing tests continue to pass (no regressions)

---

## Technical Notes

### Statistical Library Decision

The current codebase has a hand-rolled 20-line simple linear regression. Multivariate OLS with partial correlations, p-values, β-weights, and normality tests requires significantly more statistical machinery. Options:

- **Option A**: Hand-implement OLS + diagnostics in TypeScript (matrix operations, t-distribution tables). Full control, zero dependencies, but high effort and risk of numerical edge cases.
- **Option B**: Use a JS statistics library (e.g. `ml-matrix` for matrix ops + `simple-statistics` for distributions, or `jstat` for a fuller stats toolkit). Moderate dependency footprint, well-tested numerical code.
- **Option C**: Shell out to Python (`scipy.stats`, `statsmodels`) for the regression step, passing data as JSON. Strongest statistical guarantees, but adds a Python runtime dependency.

This decision should be made before implementation begins. The concept is agnostic to the choice.

### Affected Packages

| Package | Changes |
| --- | --- |
| `@isv/domain` | New schemas: `ReliabilitySummary`, `NormalityAssessment`, `OutlierReport`, `FormulaValidation`, `CalibrationRunOutput`. Extend `CalibrationResult`, `FactorDiagnostic`. |
| `@isv/clients` | Extend `TicketQuery` with timeframe filter. Wire timeframe into Jira XML adapter. |
| `@isv/services` | Replace simple linear regression with multivariate OLS. Add: factor diagnostics, residuals, normality test, outlier detection, confidence interval, formula validation. Extend `CalibrationPort` interface. |
| `@isv/pipelines` | Extend `HistoricalCalibrationConfig` with project + timeframe. Wire filtering. Compute Git metrics. Return `CalibrationRunOutput`. |

### Estimation Guidance

| Area | Relative size |
| --- | --- |
| Domain schema extensions | Small |
| Ticket client timeframe filter | Small |
| Pipeline scoping + time wiring | Small–Medium |
| Git change metrics computation | Medium |
| Multivariate regression + diagnostics | Large |
| Normality + outlier + reliability | Medium |
| Formula validation output | Medium |
| Test coverage | Medium–Large |
