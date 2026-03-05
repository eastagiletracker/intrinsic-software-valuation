import { z } from "zod";

/**
 * Confidence and reliability summary for a calibration run.
 *
 * Provides statistical measures of how trustworthy the Ship Rate estimate is.
 */
export const ReliabilitySummarySchema = z
  .object({
    sampleSize: z
      .number()
      .nonnegative()
      .int()
      .describe("Total clusters in the calibration sample"),
    effectiveSampleSize: z
      .number()
      .nonnegative()
      .int()
      .describe("Clusters remaining after outlier exclusion"),
    standardError: z
      .number()
      .nonnegative()
      .describe("Standard error of the Ship Rate estimate"),
    confidenceInterval95: z
      .object({
        lower: z.number().describe("Lower bound of the 95% CI"),
        upper: z.number().describe("Upper bound of the 95% CI"),
      })
      .describe("95% confidence interval for the Ship Rate"),
    coefficientOfVariation: z
      .number()
      .nonnegative()
      .describe("CV = standard error / Ship Rate, expressing relative precision"),
    dataQualityScore: z
      .number()
      .min(0)
      .max(1)
      .describe("DQS: (Matched + KBV) / Total hours"),
    normalityFlag: z
      .enum(["pass", "warning", "fail"])
      .describe("Normality assessment result for the residuals"),
  })
  .describe(
    "Confidence and reliability summary for the calibration Ship Rate estimate.",
  );

export type ReliabilitySummary = z.infer<typeof ReliabilitySummarySchema>;
