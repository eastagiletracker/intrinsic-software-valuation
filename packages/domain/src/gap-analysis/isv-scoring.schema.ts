import { z } from "zod";

import { ScoredFactorSchema } from "../shared/scored-factor.schema.js";
import {
  A1DataScale,
  A2UxScale,
  B1LogicScale,
  C1IntegrationScale,
  D3QualityScale,
} from "../shared/isv-factor-scales.schema.js";

/**
 * ISV scoring block from the Gap Analyzer.
 *
 * Contains five LLM-evaluated factors (A1, A2, B1, C1, D3) with their
 * discrete Fibonacci scores and reasoning. C2 is NOT included here —
 * it is derived deterministically by the Valuation service from HealthScores.
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

    D3_Quality: ScoredFactorSchema.extend({
      score: D3QualityScale,
    }).describe(
      "D3 Quality Multiplier: target Definition of Done level assessed from ticket signals and project configuration. Defaults to 1 (standard).",
    ),
  })
  .describe(
    "ISV scoring from the Gap Analyzer: five LLM-evaluated factors (A1, A2, B1, C1, D3) " +
      "with Fibonacci-based integer scores and reasoning. " +
      "C2 (State Factor) is derived separately by the Valuation service from HealthScores.",
  );

export type IsvScoring = z.infer<typeof IsvScoringSchema>;
