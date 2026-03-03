import { z } from "zod";

/**
 * Health scores: metrics representing codebase risk and technical debt.
 *
 * Strongly correlate with integration effort and influence the State Factor (C2).
 * Collected by the Status Quo Miner using deterministic tools (scc, jscpd, coverage tools).
 */

/** Complexity, duplication, and god-class metrics. */
export const ComplexityMetricsSchema = z
  .object({
    avgCyclomaticComplexity: z
      .number()
      .nonnegative()
      .describe(
        "Average cyclomatic complexity across all source files. " +
          "Higher values indicate more complex control flow and harder maintenance.",
      ),
    duplicationPercentage: z
      .number()
      .min(0)
      .max(100)
      .describe(
        "Percentage of duplicated code blocks detected by jscpd (0-100). " +
          "High duplication increases risk of inconsistent changes.",
      ),
    godClassCount: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Number of files exceeding 1000 lines of code. " +
          "God classes are high-risk change targets that amplify integration effort.",
      ),
  })
  .describe(
    "Code complexity metrics: cyclomatic complexity, duplication, and god classes. " +
      "Directly influence the C2 State Factor calculation.",
  );

export type ComplexityMetrics = z.infer<typeof ComplexityMetricsSchema>;

/** Test coverage, dependency health, and dead code metrics. */
export const TestHealthSchema = z
  .object({
    coveragePercentage: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Unit test coverage percentage (0-100) if available. " +
          "Obtained from JaCoCo (Java) or Jest/vitest (JS/TS). " +
          "Absent if coverage tooling is not configured.",
      ),
    outdatedDependencies: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Number of outdated or vulnerable dependencies. " +
          "From npm outdated or mvn versions:display-dependency-updates.",
      ),
    deadCodeFiles: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Number of dead/unused code files detected by tools like Knip. " +
          "Indicates system rot and maintenance burden.",
      ),
  })
  .describe(
    "Test health and system rot metrics: coverage, outdated dependencies, and dead code.",
  );

export type TestHealth = z.infer<typeof TestHealthSchema>;

/** Combined health scores for a repository. */
export const HealthScoresSchema = z
  .object({
    complexity: ComplexityMetricsSchema,
    testHealth: TestHealthSchema,
  })
  .describe(
    "Aggregated health scores for a repository. " +
      "Combines complexity metrics and test health into a single assessment. " +
      "These metrics feed into the C2 State Factor derivation.",
  );

export type HealthScores = z.infer<typeof HealthScoresSchema>;
