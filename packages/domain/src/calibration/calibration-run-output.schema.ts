import { z } from "zod";

import { CalibrationResultSchema } from "./calibration-result.schema.js";
import { ShipUnitClusterSchema } from "./ship-unit-cluster.schema.js";
import { ClusterResidualSchema } from "./cluster-residual.schema.js";

/**
 * Full output of a historical calibration pipeline run.
 *
 * Combines the aggregated CalibrationResult with per-cluster data
 * for drill-down analysis. Includes residuals and outlier flags
 * per cluster, plus reporting of skipped clusters.
 */
export const CalibrationRunOutputSchema = z
  .object({
    result: CalibrationResultSchema.describe(
      "Aggregated calibration result with Ship Rate, diagnostics, and validation",
    ),
    clusters: z
      .array(ShipUnitClusterSchema)
      .describe("All ship unit clusters included in the calibration"),
    residuals: z
      .array(ClusterResidualSchema)
      .describe("Per-cluster residual data from the regression model"),
    skippedClusters: z
      .array(
        z.object({
          clusterId: z.string().describe("ID of the skipped cluster"),
          reason: z.string().describe("Why the cluster was skipped"),
        }),
      )
      .describe("Clusters that were skipped during calibration with reasons"),
    executiveSummary: z
      .string()
      .optional()
      .describe(
        "AI-generated natural language summary of the calibration report. " +
          "Covers timeframe, sample size, ship rate, statistical quality, " +
          "data representativeness, and key findings.",
      ),
  })
  .describe(
    "Full calibration pipeline output: aggregated result, per-cluster data, " +
      "residuals, skipped cluster reporting, and optional executive summary.",
  );

export type CalibrationRunOutput = z.infer<typeof CalibrationRunOutputSchema>;
