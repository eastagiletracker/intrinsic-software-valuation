import { z } from "zod";

/**
 * Git change metrics for a ship unit cluster.
 *
 * Aggregates code change volume and intensity signals across all
 * tickets in a cluster. Used alongside ISV score and time tracking
 * data for statistical calibration.
 */
export const GitChangesSchema = z
  .object({
    locAdded: z
      .number()
      .nonnegative()
      .int()
      .describe("Total lines of code added across all commits in the cluster"),
    locDeleted: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Total lines of code deleted across all commits in the cluster",
      ),
    filesChanged: z
      .number()
      .nonnegative()
      .int()
      .describe("Number of distinct files changed across all commits"),
    distributionEntropy: z
      .number()
      .nonnegative()
      .describe(
        "Entropy of change distribution across files. " +
          "Higher values indicate changes spread across many files.",
      ),
    cyclomaticComplexityDelta: z
      .number()
      .describe(
        "Net change in cyclomatic complexity. " +
          "Positive means complexity was added, negative means simplification.",
      ),
    changeIntensityScore: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Composite intensity score (0-1) combining LOC, distribution, and complexity signals.",
      ),
  })
  .describe(
    "Git change metrics for a ship unit cluster: LOC, file spread, complexity delta, " +
      "and composite intensity score. Used as features in calibration regression.",
  );

export type GitChanges = z.infer<typeof GitChangesSchema>;
