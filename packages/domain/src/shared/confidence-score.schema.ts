import { z } from "zod";

/**
 * Confidence score representing certainty of an analysis result.
 *
 * Used across gap analysis, calibration, and quality gates.
 * Values below 0.7 trigger manual review; values of 1.0 indicate full certainty.
 */
export const ConfidenceScoreSchema = z
  .number()
  .min(0)
  .max(1)
  .describe(
    "Confidence score between 0.0 (no confidence) and 1.0 (full confidence). " +
      "Values below 0.7 trigger manual review per quality gate rules.",
  );

export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;
