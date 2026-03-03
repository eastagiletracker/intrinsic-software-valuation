import { z } from "zod";

/**
 * Generic pattern for a scored factor with a numeric value and human-readable reasoning.
 *
 * Used as the base structure for ISV factor evaluations (A1, A2, B1, C1) in the
 * Gap Analyzer output. Each factor gets a discrete score and a justification
 * explaining why that score was assigned.
 */
export const ScoredFactorSchema = z
  .object({
    score: z.number().describe("Numeric score value assigned to this factor"),
    reasoning: z
      .string()
      .describe(
        "Human-readable justification explaining why this score was assigned",
      ),
  })
  .describe(
    "A scored ISV factor combining a numeric value with its reasoning. " +
      "Used by the Gap Analyzer to return structured factor evaluations.",
  );

export type ScoredFactor = z.infer<typeof ScoredFactorSchema>;
