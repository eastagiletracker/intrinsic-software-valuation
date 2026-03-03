import { z } from "zod";

/**
 * Category of an architecture pattern.
 */
export const PatternCategorySchema = z
  .enum(["FRONTEND", "BACKEND", "INTEGRATION", "CMS"])
  .describe(
    "Category for grouping architecture patterns — " +
      "FRONTEND: UI/rendering patterns, " +
      "BACKEND: server-side business logic patterns, " +
      "INTEGRATION: messaging, API gateway, and orchestration patterns, " +
      "CMS: content management and platform patterns",
  );

export type PatternCategory = z.infer<typeof PatternCategorySchema>;

/**
 * An architecture pattern or capability identified in the codebase.
 *
 * Examples: SSR rendering, event-driven messaging, API throttling,
 * custom CMS modules, state management.
 */
export const CorePatternSchema = z
  .object({
    category: PatternCategorySchema,
    patternName: z
      .string()
      .min(1)
      .describe(
        "Name of the pattern, e.g. 'SSR', 'Event-Driven Messaging', 'Redux State Management'",
      ),
    description: z
      .string()
      .describe(
        "Brief description of how this pattern is implemented in the codebase",
      ),
  })
  .describe(
    "An architecture pattern or capability detected in the repository. " +
      "Used by the Gap Analyzer to assess whether existing patterns cover new requirements.",
  );

export type CorePattern = z.infer<typeof CorePatternSchema>;
