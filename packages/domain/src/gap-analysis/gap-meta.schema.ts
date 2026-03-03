import { z } from "zod";

import { ConfidenceScoreSchema } from "../shared/confidence-score.schema.js";

/**
 * Meta information about a gap analysis run.
 *
 * Contains quality gate signals: whether the ticket is actionable and
 * the confidence level of the analysis. Low confidence triggers manual review.
 */
export const GapMetaSchema = z
  .object({
    isTicketActionable: z
      .boolean()
      .describe(
        "Whether the ticket is sufficiently described for architectural analysis. " +
          "If false, the pipeline should abort and return the ticket for refinement.",
      ),
    reasonIfNotActionable: z
      .string()
      .optional()
      .describe(
        "Explanation why the ticket was deemed not actionable. " +
          "Only present when isTicketActionable is false.",
      ),
    confidenceScore: ConfidenceScoreSchema.describe(
      "AI confidence in the analysis result. " +
        "Values below 0.7 trigger a manual review flag on the ISV score.",
    ),
  })
  .describe(
    "Quality gate metadata for a gap analysis: actionability check and confidence score.",
  );

export type GapMeta = z.infer<typeof GapMetaSchema>;
