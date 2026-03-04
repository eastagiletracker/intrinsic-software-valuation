import { z } from "zod";

import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";
import { C2StateScale } from "../shared/isv-factor-scales.schema.js";
import { SystemContextSchema } from "../system-context/system-context.schema.js";
import { CodeHealthReportSchema } from "../code-health/code-health-report.schema.js";

/**
 * Combined baseline entry for a single repository.
 *
 * Pairs the qualitative architecture analysis (SystemContext) with
 * the quantitative health metrics (CodeHealthReport) for one repository.
 */
export const RepositoryBaselineSchema = z
  .object({
    systemContext: SystemContextSchema.describe(
      "Architecture baseline: patterns, adapters, domain models (from Architecture Scanner)",
    ),
    codeHealthReport: CodeHealthReportSchema.describe(
      "Health metrics: LOC, complexity, coverage, hotspots (from Status Quo Miner)",
    ),
    c2State: C2StateScale.optional().describe(
      "Per-repository C2 State Factor derived by the Valuation service " +
        "from health scores using the C2 penalty model. " +
        "Populated after baseline collection, before ISV calculation.",
    ),
  })
  .describe(
    "Combined Fact Finder output for a single repository: " +
      "architecture context (qualitative) plus code health (quantitative), " +
      "with an optional per-repo C2 State Factor derived during valuation.",
  );

export type RepositoryBaseline = z.infer<typeof RepositoryBaselineSchema>;

/**
 * Aggregated baseline across all repositories for one analysis run.
 *
 * Built by the pipeline after invoking the Architecture Scanner and
 * Status Quo Miner for each of the n target repositories.
 * Serves as the unified input for the Gap Analyzer and Valuation Engine.
 *
 * After baseline collection the Valuation service derives a per-repo C2
 * State Factor from each repository's HealthScores and sets `effectiveC2`
 * to the maximum across all repositories (any single toxic repo poisons
 * the whole system intervention).
 */
export const SystemBaselineSchema = z
  .object({
    timestamp: IsoTimestampSchema.describe(
      "Baseline timestamp (T0) — the point in time these metrics represent. " +
        "For historical calibration this is derived from the first Git commit or Jira status transition.",
    ),
    repositories: z
      .array(RepositoryBaselineSchema)
      .min(1)
      .describe(
        "Per-repository baselines. At least one repository is required per analysis run.",
      ),
    effectiveC2: C2StateScale.optional().describe(
      "Effective C2 State Factor across all repositories — the maximum of all per-repo C2 values. " +
        "Populated by the Valuation service after deriving per-repo C2 scores. " +
        "Used as the C2 input for the ISV formula.",
    ),
  })
  .describe(
    "Aggregated system baseline across all analyzed repositories. " +
      "Pipeline-level construct that bundles per-repo Fact Finder outputs " +
      "into a single input for the Gap Analyzer and Valuation Engine. " +
      "Includes the effective C2 State Factor (max across repos) after valuation-service derivation.",
  );

export type SystemBaseline = z.infer<typeof SystemBaselineSchema>;
