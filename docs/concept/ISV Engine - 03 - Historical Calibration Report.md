# ISV Engine: Historical Calibration Report

## Purpose

This document defines how a completed historical calibration run is visualized as a digital report.

The report goal is transparency, not decoration:

- make all relevant calibration values visible,
- make data quality and uncertainty explicit,
- make questionable metrics immediately identifiable,
- provide clear drill-down to cluster-level details.

The report is generated from static JSON results created by the CLI and rendered as an HTML/digital UI.

## Position in the ISV Concept

- Calibration computes the empirical relationship between ISV and invested hours.
- The report communicates calibration outcomes and quality signals for human review.
- The report does not change formula weights automatically.

See also: [ISV Engine - 03 - Historical Calibration](ISV%20Engine%20-%2003%20-%20Historical%20Calibration.md).

## Canonical Data Source

The report uses `CalibrationRunOutput` JSON files produced by CLI runs.

- Source of truth: saved JSON on the local file system.
- No live recalculation in the UI.
- UI reads and visualizes existing files only.

## Terminology and Explanation UX

Calibration uses domain-specific terms (for example: `Ship Rate`, `DQS`, `KBV`, `Residual`, `Outlier`, `Partial Correlation`, `Beta Weight`).

The report must provide optional explanation support:

- hover tooltip on term labels,
- optional persistent "Show Explanations" toggle (on/off),
- explanations use glossary-aligned wording,
- explanations are non-blocking and can be hidden for expert users.

This keeps the report useful for both new and experienced stakeholders.

## Core Sections of the Report

### 1. Executive Summary

Mandatory top-level metrics:

- Ship Rate (hours per ISV)
- Ship Rate excluding outliers
- R² and adjusted R²
- data quality score (DQS)
- confidence interval (95%) and standard error
- coefficient of variation
- normality flag
- formula version
- used timeframe (`periodStart` to `periodEnd`)
- sample size and effective sample size

### 2. Cluster Scatter Plot (Worded Correctly)

A scatter chart is required, but wording must avoid "prediction" semantics that imply planning estimates.

Use this wording:

- "Cluster Scatter Plot: ISV-Derived Comparison Value vs. Actual Hours"

Do not use this wording:

- "Actual vs Predicted Hours"

Reason:

- The calibration process does not estimate planned hours per ticket in advance.
- It computes ISV and Ship Rate and compares resulting ISV-based comparison values against tracked historical hours.

### 3. Residual and Distribution Transparency

The report visualizes:

- residual distribution,
- normality test result and p-value,
- skewness and kurtosis,
- outlier count and percentage,
- outlier impact on Ship Rate.

### 4. Factor and Feature Diagnostics

The report visualizes per-feature diagnostics for all ISV factors and Git metrics:

- partial correlation,
- standardized beta weight,
- p-value,
- significance flag,
- formula mismatch indicators.

### 5. Data Quality and Non-Tracked Time Visibility

The report must explicitly visualize attribution quality and missing linkage:

- matched hours,
- KBV hours,
- unlinked overhead hours,
- total hours and DQS formula.

The objective is to make non-tracked or weakly linked time visible instead of hiding it.

## Report Storage Model (CLI Output)

The CLI is responsible for persisting report data.

### File storage requirements

- reports are stored under project/client-specific folders,
- multiple runs per project must coexist,
- timeframe variants must be distinguishable,
- metadata required for report list view must be included.

Recommended path model:

- `data/<clientSlug>/calibration/report-<periodStart>_<periodEnd>.json`

Naming convention:

- `report-YYYY-MM_YYYY-MM.json`

Example:

- `report-2024-09_2026-02.json`

### Optional manifest

For efficient listing, a manifest file may be used:

- `data/<clientSlug>/calibration/index.json`

Each entry should include:

- report filename,
- created timestamp,
- timeframe,
- sample size,
- fit assessment,
- short annotation label.

## Routing and Navigation Concept

The UI should support both index and detail routes for static report files.

Recommended route model:

- `/calibration-reports` -> list all saved reports (filter by project/timeframe/status)
- `/calibration-reports/:projectSlug/:reportId` -> open one report

List view requirements:

- show all available report files for a project,
- display metadata annotation (timeframe, date, key quality badges),
- open report on click.

Detail view requirements:

- render a full HTML report from the selected JSON file,
- keep direct linkability for collaboration and review.

## Charting Library Decision

A charting library is required for the report visualizations.

Recommended library:

- `layerchart`

Rationale:

- Svelte-native chart components,
- supports scatter/distribution/bar compositions needed for calibration reporting,
- aligns with current SvelteKit web interface architecture.

Fallback:

- if needed, basic charts can be built with SVG, but this increases implementation complexity and maintenance cost for advanced charts.

## Quality Rules for Report Communication

The report must always distinguish:

- measured values,
- derived values,
- interpretation.

The report must avoid implying certainty where confidence is low.

When a metric quality flag is warning/fail, this must be visible in the summary and in the corresponding detailed section.

## Cross-References

- [ISV Engine - 03 - Historical Calibration](ISV%20Engine%20-%2003%20-%20Historical%20Calibration.md)
- [ISV Engine - 99 - Glossary](ISV%20Engine%20-%2099%20-%20Glossary.md)
- [Architecture](../architecture/architecture.md)
- [Tech Stack Decision](../architecture/techstack.md)
