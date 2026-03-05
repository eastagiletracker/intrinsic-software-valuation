import { z } from "zod";

/**
 * Result of a normality test on calibration residuals.
 *
 * Shapiro-Wilk is used for n < 50, Kolmogorov-Smirnov for n ≥ 50.
 * The normality flag guides interpretation of regression results.
 */
export const NormalityAssessmentSchema = z
  .object({
    testName: z
      .enum(["shapiro-wilk", "kolmogorov-smirnov"])
      .describe("Which normality test was applied"),
    testStatistic: z
      .number()
      .describe("The test statistic (W for Shapiro-Wilk, D for K-S)"),
    pValue: z
      .number()
      .min(0)
      .max(1)
      .describe("p-value of the normality test"),
    skewness: z.number().describe("Sample skewness of the residuals"),
    kurtosis: z.number().describe("Sample excess kurtosis of the residuals"),
    flag: z
      .enum(["pass", "warning", "fail"])
      .describe(
        "Normality flag: pass (p ≥ 0.05), warning (0.01 ≤ p < 0.05), fail (p < 0.01)",
      ),
  })
  .describe(
    "Normality assessment of calibration residuals using Shapiro-Wilk or Kolmogorov-Smirnov.",
  );

export type NormalityAssessment = z.infer<typeof NormalityAssessmentSchema>;
