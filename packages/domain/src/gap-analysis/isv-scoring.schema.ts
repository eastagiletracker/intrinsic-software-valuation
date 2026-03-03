import { z } from "zod";

import { ScoredFactorSchema } from "../shared/scored-factor.schema.js";
import {
  A1DataScale,
  A2UxScale,
  B1LogicScale,
  C1IntegrationScale,
} from "../shared/isv-factor-scales.schema.js";

/**
 * ISV scoring block from the Gap Analyzer.
 *
 * Contains the four LLM-evaluated factors (A1, A2, B1, C1) with their
 * discrete Fibonacci scores and reasoning. C2 and D3 are NOT included
 * here — they come from the Fact Finder and pipeline configuration respectively.
 *
 * Each factor uses the ScoredFactor pattern (score + reasoning) but restricts
 * the score to its specific Fibonacci scale.
 */
export const IsvScoringSchema = z
  .object({
    A1_Data: ScoredFactorSchema.extend({
      score: A1DataScale,
    }).describe("A1 Data Value: effort on entity and data-model layer"),

    A2_UX: ScoredFactorSchema.extend({
      score: A2UxScale,
    }).describe("A2 UX Multiplier: depth of user interaction"),

    B1_Logic: ScoredFactorSchema.extend({
      score: B1LogicScale,
    }).describe(
      "B1 Logic Value: algorithmic depth and transformation complexity",
    ),

    C1_Integration: ScoredFactorSchema.extend({
      score: C1IntegrationScale,
    }).describe("C1 Integration Factor: how deep the architecture cut is"),
  })
  .describe(
    "ISV scoring from the Gap Analyzer: four LLM-evaluated factors (A1, A2, B1, C1) " +
      "with Fibonacci-based scores and reasoning. C2 (State Factor) and D3 (Quality) " +
      "are derived separately and combined in the Valuation Engine.",
  );

export type IsvScoring = z.infer<typeof IsvScoringSchema>;
