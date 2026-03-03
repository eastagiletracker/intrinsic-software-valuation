import { z } from "zod";

import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";
import { RepositoryRefSchema } from "../shared/repository-ref.schema.js";
import { StructuralFactsSchema } from "./structural-facts.schema.js";
import { HealthScoresSchema } from "./health-scores.schema.js";

/**
 * Code health report for a single repository at a specific point in time.
 *
 * Produced by the Status Quo Miner (Fact Finder, phase 1) using deterministic
 * tools. Contains two dimensions: structural facts (size and activity) and
 * health scores (risk and technical debt).
 *
 * This is the quantitative half of the Fact Finder output.
 * The qualitative half is the SystemContext from the Architecture Scanner.
 *
 * Health scores directly influence the C2 State Factor in the ISV formula.
 */
export const CodeHealthReportSchema = z
  .object({
    repository: RepositoryRefSchema.describe(
      "The repository this report was generated for",
    ),
    timestamp: IsoTimestampSchema.describe(
      "Point in time at which this report was captured. " +
        "For historical analysis this is the T0 baseline timestamp.",
    ),
    structuralFacts: StructuralFactsSchema,
    healthScores: HealthScoresSchema,
  })
  .describe(
    "Code health report for a single repository at a specific timestamp. " +
      "Combines structural facts (LOC, entry points, hotspots) with health scores " +
      "(complexity, duplication, test coverage). Produced by the Status Quo Miner.",
  );

export type CodeHealthReport = z.infer<typeof CodeHealthReportSchema>;
