import { z } from "zod";

import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";
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
  })
  .describe(
    "Combined Fact Finder output for a single repository: " +
      "architecture context (qualitative) plus code health (quantitative).",
  );

export type RepositoryBaseline = z.infer<typeof RepositoryBaselineSchema>;

/**
 * Aggregated baseline across all repositories for one analysis run.
 *
 * Built by the pipeline after invoking the Architecture Scanner and
 * Status Quo Miner for each of the n target repositories.
 * Serves as the unified input for the Gap Analyzer.
 *
 * The aggregatedHealthScore is a weighted C2-proxy across all repositories,
 * derived by the pipeline or valuation service from individual health metrics.
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
  })
  .describe(
    "Aggregated system baseline across all analyzed repositories. " +
      "Pipeline-level construct that bundles per-repo Fact Finder outputs " +
      "into a single input for the Gap Analyzer and Valuation Engine.",
  );

export type SystemBaseline = z.infer<typeof SystemBaselineSchema>;
