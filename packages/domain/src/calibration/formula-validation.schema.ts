import { z } from "zod";

/**
 * Fit assessment of the overall regression model.
 */
export const FitAssessmentSchema = z
  .enum(["strong", "moderate", "weak"])
  .describe(
    "Overall fit assessment based on R² thresholds: strong (≥ 0.7), moderate (0.4–0.7), weak (< 0.4)",
  );

export type FitAssessment = z.infer<typeof FitAssessmentSchema>;

/**
 * A single factor ranking entry sorted by |partial correlation|.
 */
export const FactorRankingEntrySchema = z
  .object({
    feature: z.string().describe("Feature name (ISV factor or Git metric)"),
    absPartialCorrelation: z
      .number()
      .min(0)
      .max(1)
      .describe("Absolute value of the partial correlation"),
    isSignificant: z
      .boolean()
      .describe("True when p-value < 0.05"),
  })
  .describe("A ranked feature entry sorted by explanatory power.");

export type FactorRankingEntry = z.infer<typeof FactorRankingEntrySchema>;

/**
 * Formula-vs-reality mismatch flags.
 */
export const FormulaMismatchSchema = z
  .object({
    multiplicativeFactorsWithLowWeight: z
      .array(z.string())
      .describe(
        "Multiplicative factors (C1, C2, D3) with low empirical weight",
      ),
    additiveFactorsWithDominantWeight: z
      .array(z.string())
      .describe(
        "Additive factors (A1, A2, B1) with dominant empirical weight",
      ),
    gitMetricsOutperformingIsv: z
      .boolean()
      .describe("True when Git metrics collectively explain more variance than ISV factors"),
  })
  .describe("Formula-vs-reality mismatch detection results.");

export type FormulaMismatch = z.infer<typeof FormulaMismatchSchema>;

/**
 * Full formula validation output from calibration.
 */
export const FormulaValidationSchema = z
  .object({
    fitAssessment: FitAssessmentSchema.describe(
      "Overall model fit assessment",
    ),
    shipRateReliability: z
      .string()
      .describe("Ship Rate reliability assessment text"),
    dataQualityAssessment: z
      .string()
      .describe("Data quality assessment text"),
    factorRanking: z
      .array(FactorRankingEntrySchema)
      .describe(
        "All features sorted by |partial correlation| descending with significance flags",
      ),
    mismatches: FormulaMismatchSchema.describe(
      "Formula-vs-reality mismatch flags",
    ),
    recommendations: z
      .array(z.string())
      .describe(
        "Actionable text strings derived from the statistical results",
      ),
  })
  .describe(
    "Structured formula validation output from the calibration regression analysis.",
  );

export type FormulaValidation = z.infer<typeof FormulaValidationSchema>;
