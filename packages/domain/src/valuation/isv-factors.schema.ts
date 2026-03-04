import { z } from "zod";

import {
  A1DataScale,
  A2UxScale,
  B1LogicScale,
  C1IntegrationScale,
  C2StateScale,
  D3QualityScale,
} from "../shared/isv-factor-scales.schema.js";

/**
 * All six ISV factors unified for the Valuation Engine.
 *
 * This is the central input for the ISV formula calculation.
 * Factors come from different sources:
 * - A1, A2, B1, C1 — from the Gap Analyzer (LLM-evaluated)
 * - C2 — derived from the CodeHealthReport (Status Quo Miner)
 * - D3 — from pipeline configuration or ticket metadata
 *
 * The pipeline is responsible for assembling these from their respective sources.
 */
export const IsvFactorsSchema = z
  .object({
    A1_Data: A1DataScale.describe(
      "Data Value: effort on entity and data-model layer. From Gap Analyzer.",
    ),
    A2_UX: A2UxScale.describe(
      "UX Multiplier: depth of user interaction. From Gap Analyzer.",
    ),
    B1_Logic: B1LogicScale.describe(
      "Logic Value: algorithmic depth. From Gap Analyzer. " +
        "Only additive factor — 0 means no logic complexity contribution.",
    ),
    C1_Integration: C1IntegrationScale.describe(
      "Integration Factor: architecture cut depth. From Gap Analyzer.",
    ),
    C2_State: C2StateScale.describe(
      "State Factor: technical debt and system health. " +
        "Derived deterministically by the Valuation service from CodeHealthReport HealthScores " +
        "using the C2 penalty model. Never set manually.",
    ),
    D3_Quality: D3QualityScale.describe(
      "Quality Multiplier: Definition of Done level. " +
        "Assessed by the Gap Analyzer from ticket signals and project configuration. " +
        "Defaults to 1 (standard DoD) when no elevated requirements are detected.",
    ),
  })
  .describe(
    "All six ISV factors for the Valuation Engine. " +
      "Assembled by the pipeline from Gap Analyzer (A1, A2, B1, C1, D3) " +
      "and Valuation service (C2, derived from HealthScores).",
  );

export type IsvFactors = z.infer<typeof IsvFactorsSchema>;
