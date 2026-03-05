import { z } from "zod";

import { RegressionFeatureDiagnosticSchema } from "./regression-feature-diagnostic.schema.js";
import { ReliabilitySummarySchema } from "./reliability-summary.schema.js";
import { OutlierReportSchema } from "./outlier-report.schema.js";
import { NormalityAssessmentSchema } from "./normality-assessment.schema.js";
import { FormulaValidationSchema } from "./formula-validation.schema.js";

/**
 * Result of a historical calibration run.
 *
 * Contains the Ship Rate (hours per ISV point), statistical quality
 * indicators, the formula version used, and per-cluster results for
 * auditing and drill-down.
 *
 * Includes mandatory factor-level diagnostics, reliability summary,
 * outlier report, normality assessment, and formula validation.
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
    shipRateExclOutliers: z
      .number()
      .positive()
      .describe(
        "Ship Rate after excluding outlier clusters. " +
          "May equal shipRateHoursPerIsv when there are no outliers.",
      ),
    rSquared: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "R² correlation coefficient of the regression model. " +
          "Target is > 0.7 for a stable empirical correlation.",
      ),
    adjustedRSquared: z
      .number()
      .max(1)
      .describe(
        "Adjusted R² accounting for the number of features. " +
          "More conservative than R² for multivariate models.",
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
      .array(RegressionFeatureDiagnosticSchema)
      .describe(
        "Mandatory per-feature diagnostics: partial correlations, weights, and p-values " +
          "for all 6 ISV factors and 3 Git metrics. " +
          "Informs human review of formula validity — never triggers automatic formula changes.",
      ),
    reliability: ReliabilitySummarySchema.describe(
      "Confidence and reliability summary for the Ship Rate estimate",
    ),
    outliers: OutlierReportSchema.describe(
      "Outlier detection report from calibration regression",
    ),
    normalityAssessment: NormalityAssessmentSchema.describe(
      "Normality assessment of the regression residuals",
    ),
    formulaValidation: FormulaValidationSchema.describe(
      "Structured formula validation output",
    ),
  })
  .describe(
    "Historical calibration result: formula version, Ship Rate, R² correlation, " +
      "data quality score, sample size, factor-level diagnostics, reliability, " +
      "outlier report, normality assessment, and formula validation. " +
      "Translates abstract ISV points into empirically grounded time estimates.",
  );

export type CalibrationResult = z.infer<typeof CalibrationResultSchema>;
