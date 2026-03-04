import { z } from "zod";

import { FactorDiagnosticSchema } from "./factor-diagnostic.schema.js";

/**
 * Result of a historical calibration run.
 *
 * Contains the Ship Rate (hours per ISV point), statistical quality
 * indicators, the formula version used, and per-cluster results for
 * auditing and drill-down.
 *
 * Optionally includes factor-level diagnostics when advanced analysis
 * is enabled. Diagnostics validate the static ISV formula against
 * empirical data — they inform human decisions about formula revisions
 * but never trigger automatic adjustments.
 *
 * The calibration target is R² > 0.7 between ISV scores and actual
 * invested hours, including change intensity, complexity, and
 * distribution entropy as additional regression features.
 */
export const CalibrationResultSchema = z
  .object({
    formulaVersion: z
      .string()
      .min(1)
      .describe(
        "Semantic version of the ISV formula this calibration was computed against, e.g. '3.4'. " +
          "Must match the formulaVersion in all ShipUnitCluster inputs.",
      ),
    shipRateHoursPerIsv: z
      .number()
      .positive()
      .describe(
        "Empirical conversion rate: average hours per ISV point. " +
          "Primary output used for budget and capacity planning.",
      ),
    rSquared: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "R² correlation coefficient of the regression model. " +
          "Target is > 0.7 for a stable empirical correlation.",
      ),
    dataQualityScore: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "DQS: (Matched + KBV) / Total hours. " +
          "Periods with DQS < 0.85 are flagged for confidence filtering.",
      ),
    sampleSize: z
      .number()
      .nonnegative()
      .int()
      .describe("Number of ship unit clusters included in the calibration"),
    periodStart: z
      .string()
      .describe("Start of the calibration period (ISO 8601 date or timestamp)"),
    periodEnd: z
      .string()
      .describe("End of the calibration period (ISO 8601 date or timestamp)"),
    factorDiagnostics: z
      .array(FactorDiagnosticSchema)
      .optional()
      .describe(
        "Optional advanced diagnostics: per-factor partial correlations, weights, and p-values. " +
          "Present only when advanced diagnostics mode is enabled. " +
          "Informs human review of formula validity — never triggers automatic formula changes.",
      ),
  })
  .describe(
    "Historical calibration result: formula version, Ship Rate, R² correlation, " +
      "data quality score, sample size, and optional factor-level diagnostics. " +
      "Translates abstract ISV points into empirically grounded time estimates.",
  );

export type CalibrationResult = z.infer<typeof CalibrationResultSchema>;
