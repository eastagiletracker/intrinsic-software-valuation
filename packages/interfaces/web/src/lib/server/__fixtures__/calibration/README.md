# Calibration Report Fixtures

Committed fixtures for Tier 2 adapter testing of `listCalibrationReports` and `readCalibrationReport`.

## Provenance

Hand-crafted based on the `CalibrationRunOutput` schema from `@isv/domain`.
Field values are synthetic — no real client data. All ticket IDs use the `PROJ-` prefix.

## Contents

| File | Period | Fit | R² | Sample size |
| --- | --- | --- | --- | --- |
| `report-2025-01_2026-01.json` | 2025-01 → 2026-01 | strong | 0.78 | 18 |
| `report-2024-06_2025-05.json` | 2024-06 → 2025-05 | moderate | 0.52 | 8 |

Generated: 2026-03-05
