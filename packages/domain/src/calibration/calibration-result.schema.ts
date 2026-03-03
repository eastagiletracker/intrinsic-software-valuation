import { z } from "zod";

/**
 * Result of a historical calibration run.
 *
 * Contains the Ship Rate (hours per ISV point), statistical quality
 * indicators, and per-cluster results for auditing and drill-down.
 *
 * The calibration target is R² > 0.7 between ISV scores and actual
 * invested hours, including change intensity, complexity, and
 * distribution entropy as additional regression features.
 */
export const CalibrationResultSchema = z
  .object({
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
  })
  .describe(
    "Historical calibration result: Ship Rate, R² correlation, data quality score, " +
      "and sample size. Translates abstract ISV points into empirically grounded time estimates.",
  );

export type CalibrationResult = z.infer<typeof CalibrationResultSchema>;
