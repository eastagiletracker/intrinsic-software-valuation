import { z } from "zod";

import { TicketIdSchema } from "../shared/ticket-id.schema.js";
import { GapMetaSchema } from "./gap-meta.schema.js";
import { ArchitecturalFitSchema } from "./architectural-fit.schema.js";
import { IdentifiedGapsSchema } from "./identified-gaps.schema.js";
import { RequiredModificationsSchema } from "./required-modifications.schema.js";
import { IsvScoringSchema } from "./isv-scoring.schema.js";

/**
 * Complete output of the Gap Analyzer (phase 2).
 *
 * Produced by the Gap Analyzer service after comparing a Jira ticket
 * (target state) with the system baseline (current state). Contains:
 * - Quality gate metadata (actionability, confidence)
 * - Architectural fit assessment
 * - Identified gaps across four dimensions (data, UI, logic, integration)
 * - Actionable modification list
 * - ISV factor scores (A1, A2, B1, C1) for the Valuation Engine
 *
 * This schema matches the LLM structured output format.
 * Results are persisted and can be written back to Jira as comments/fields.
 */
export const GapAnalysisResultSchema = z
  .object({
    ticketId: TicketIdSchema.describe("ID of the analyzed ticket"),
    meta: GapMetaSchema,
    architecturalFit: ArchitecturalFitSchema,
    identifiedGaps: IdentifiedGapsSchema,
    requiredModifications: RequiredModificationsSchema,
    isvScoring: IsvScoringSchema,
  })
  .describe(
    "Complete Gap Analyzer output for a single ticket: quality gate metadata, " +
      "architectural fit, identified gaps, required modifications, and ISV factor scores. " +
      "Primary input for the Valuation Engine (phase 3).",
  );

export type GapAnalysisResult = z.infer<typeof GapAnalysisResultSchema>;
