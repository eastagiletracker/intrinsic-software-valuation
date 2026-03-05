import { z } from "zod";

import { TicketIdSchema } from "../shared/ticket-id.schema.js";

/**
 * A single outlier entry from calibration regression.
 */
export const OutlierEntrySchema = z
  .object({
    clusterId: TicketIdSchema.describe("Cluster flagged as outlier"),
    residual: z.number().describe("Raw residual (actual − predicted)"),
    standardizedResidual: z
      .number()
      .describe("Standardized residual (residual / σ)"),
    reason: z
      .string()
      .describe(
        "Human-readable reason label, e.g. HIGH_KBV_RATIO, ZERO_GIT_CHANGES, EXTREME_HOURS",
      ),
  })
  .describe("A single outlier entry from calibration.");

export type OutlierEntry = z.infer<typeof OutlierEntrySchema>;

/**
 * Outlier report from calibration regression.
 */
export const OutlierReportSchema = z
  .object({
    outlierCount: z.number().nonnegative().int().describe("Number of outliers"),
    outlierPercentage: z
      .number()
      .min(0)
      .max(1)
      .describe("Fraction of clusters flagged as outliers"),
    entries: z
      .array(OutlierEntrySchema)
      .describe("All flagged outlier entries"),
  })
  .describe("Outlier detection report from calibration regression.");

export type OutlierReport = z.infer<typeof OutlierReportSchema>;
