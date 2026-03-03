import { z } from "zod";

import { TicketIdSchema } from "../shared/ticket-id.schema.js";
import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";
import { ConfidenceScoreSchema } from "../shared/confidence-score.schema.js";
import { GitChangesSchema } from "./git-changes.schema.js";

/**
 * A ship unit cluster: a logical grouping of related tickets
 * evaluated as one unit for calibration.
 *
 * A cluster typically consists of a story or task plus its subtasks.
 * It bundles ISV analysis results, actual time invested, and Git
 * change metrics for one calibration data point.
 *
 * Built by the historical calibration pipeline after:
 * 1. Ticket clustering (parent + subtasks)
 * 2. ISV calculation at T0 baseline
 * 3. Time tracking attribution
 * 4. Git change analysis
 */
export const ShipUnitClusterSchema = z
  .object({
    clusterId: TicketIdSchema.describe(
      "Primary ticket ID of the cluster (usually the parent story/task)",
    ),
    ids: z
      .array(TicketIdSchema)
      .min(1)
      .describe(
        "All ticket IDs in this cluster (parent + subtasks). " +
          "Used for time attribution matching.",
      ),
    metadata: z
      .object({
        type: z
          .string()
          .min(1)
          .describe("Issue type of the primary ticket, e.g. 'Story', 'Task'"),
        storyPoints: z
          .number()
          .nonnegative()
          .optional()
          .describe("Story points of the primary ticket, if available"),
        timestampT0: IsoTimestampSchema.describe(
          "Baseline timestamp (T0): first relevant Git commit or Jira status transition. " +
            "Used for historical checkout by the Fact Finder.",
        ),
      })
      .describe(
        "Metadata about the cluster: type, story points, and baseline timestamp",
      ),
    isvAnalysis: z
      .object({
        isvScore: z
          .number()
          .nonnegative()
          .describe("Calculated ISV score for this cluster at T0 baseline"),
        confidence: ConfidenceScoreSchema.describe(
          "Gap Analyzer confidence for this cluster's analysis",
        ),
      })
      .describe("ISV analysis results for this cluster"),
    metrics: z
      .object({
        totalHours: z
          .number()
          .nonnegative()
          .describe(
            "Sum of all attributed hours across all ticket IDs in the cluster. " +
              "Ground truth for calibration regression.",
          ),
        gitChanges: GitChangesSchema.describe(
          "Aggregated Git change metrics for this cluster",
        ),
      })
      .describe(
        "Measurement data: actual time invested and code change metrics",
      ),
  })
  .describe(
    "Ship unit cluster: a story/task with subtasks evaluated as one calibration unit. " +
      "Combines ISV score, actual hours, and Git metrics for statistical correlation.",
  );

export type ShipUnitCluster = z.infer<typeof ShipUnitClusterSchema>;
