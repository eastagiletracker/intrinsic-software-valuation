import { z } from "zod";

import { TicketIdSchema } from "../shared/ticket-id.schema.js";

/**
 * Residual data for a single ship unit cluster.
 *
 * Produced by the calibration regression step. Used for outlier detection,
 * normality assessment, and per-cluster drill-down.
 */
export const ClusterResidualSchema = z
  .object({
    clusterId: TicketIdSchema.describe(
      "Primary ticket ID of the cluster this residual belongs to",
    ),
    actualHours: z
      .number()
      .nonnegative()
      .describe("Observed total hours for this cluster"),
    predictedHours: z
      .number()
      .describe("Hours predicted by the regression model"),
    residual: z
      .number()
      .describe("Actual − predicted hours"),
    standardizedResidual: z
      .number()
      .describe("Residual divided by residual standard deviation"),
    isOutlier: z
      .boolean()
      .describe("True when |standardizedResidual| > 2"),
  })
  .describe(
    "Per-cluster residual from the calibration regression model.",
  );

export type ClusterResidual = z.infer<typeof ClusterResidualSchema>;
