import { z } from "zod";

import { CalibrationResultSchema } from "./calibration-result.schema.js";
import { ClusterResidualSchema } from "./cluster-residual.schema.js";

// ---------------------------------------------------------------------------
// Cohort labels
// ---------------------------------------------------------------------------

/**
 * Cohort codes:
 * - A = high data confidence
 * - B = medium data confidence
 * - C = low data confidence
 */
export const CohortCodeSchema = z
  .enum(["A", "B", "C"])
  .describe("Cohort code: A (high), B (medium), C (low) data confidence");

export type CohortCode = z.infer<typeof CohortCodeSchema>;

/**
 * Pre-computed cohort combination keys.
 * The calibration pipeline computes results for "A", "A+B", and "A+B+C".
 */
export const CohortKeySchema = z
  .enum(["A", "A+B", "A+B+C"])
  .describe(
    "Cohort combination key identifying which confidence tiers are included",
  );

export type CohortKey = z.infer<typeof CohortKeySchema>;

// ---------------------------------------------------------------------------
// Cohort overview (compact dashboard line per cohort)
// ---------------------------------------------------------------------------

export const CohortOverviewEntrySchema = z
  .object({
    cohort: CohortCodeSchema,
    label: z.string().describe("Human-readable label, e.g. 'High confidence'"),
    clusterCount: z
      .number()
      .nonnegative()
      .int()
      .describe("Number of clusters in this cohort"),
    clusterPct: z
      .number()
      .min(0)
      .max(100)
      .describe("Percentage of total clusters"),
    totalHours: z
      .number()
      .nonnegative()
      .describe("Sum of totalHours across clusters in this cohort"),
    hoursPct: z
      .number()
      .min(0)
      .max(100)
      .describe("Percentage of total tracked hours"),
  })
  .describe(
    "Compact summary for a single data-confidence cohort (A, B, or C)",
  );

export type CohortOverviewEntry = z.infer<typeof CohortOverviewEntrySchema>;

// ---------------------------------------------------------------------------
// Cohort calibration (full regression result for a cohort combination)
// ---------------------------------------------------------------------------

export const CohortCalibrationSchema = z
  .object({
    key: CohortKeySchema,
    includedCohorts: z
      .array(CohortCodeSchema)
      .min(1)
      .describe("Which cohorts are included in this calibration"),
    sampleSize: z
      .number()
      .nonnegative()
      .int()
      .describe("Number of clusters in this combination"),
    calibration: CalibrationResultSchema.describe(
      "Full calibration result for this cohort combination",
    ),
    residuals: z
      .array(ClusterResidualSchema)
      .describe("Per-cluster residuals for the clusters in this combination"),
  })
  .describe(
    "Pre-computed calibration result for a cohort combination (A, A+B, or A+B+C)",
  );

export type CohortCalibration = z.infer<typeof CohortCalibrationSchema>;
