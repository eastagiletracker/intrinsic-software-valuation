import { z } from "zod";

/**
 * Statistical diagnostic for a single regression feature (ISV factor or Git metric).
 *
 * Extends the concept of FactorDiagnostic to cover all features used in
 * multivariate calibration regression: the 6 ISV factors plus 3 Git metrics.
 */
export const RegressionFeatureDiagnosticSchema = z
  .object({
    feature: z
      .enum([
        "A1_Data",
        "A2_UX",
        "B1_Logic",
        "C1_Integration",
        "C2_State",
        "D3_Quality",
        "distributionEntropy",
        "cyclomaticComplexityDelta",
        "changeIntensityScore",
      ])
      .describe("Name of the regression feature this diagnostic describes"),
    partialCorrelation: z
      .number()
      .min(-1)
      .max(1)
      .describe(
        "Partial correlation (r) of this feature with actual hours, " +
          "controlling for all other features.",
      ),
    weight: z
      .number()
      .describe(
        "Standardized regression coefficient (β). " +
          "Empirical direction and magnitude of the feature's influence.",
      ),
    pValue: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Statistical significance of the feature's contribution. " +
          "Features with p > 0.05 may not carry meaningful signal.",
      ),
  })
  .describe(
    "Per-feature statistical diagnostic from multivariate calibration regression.",
  );

export type RegressionFeatureDiagnostic = z.infer<
  typeof RegressionFeatureDiagnosticSchema
>;
