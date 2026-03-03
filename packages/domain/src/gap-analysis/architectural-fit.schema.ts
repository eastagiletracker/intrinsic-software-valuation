import { z } from "zod";

/**
 * Assessment of whether existing architecture can handle the new requirement.
 */
export const ArchitecturalFitSchema = z
  .object({
    canBeImplementedWithExistingPatterns: z
      .boolean()
      .describe(
        "Whether the requirement can be fully implemented using existing " +
          "architecture patterns and integrations without structural changes.",
      ),
    summary: z
      .string()
      .describe(
        "Human-readable summary of the architectural fit assessment. " +
          "Explains what matches and what is missing.",
      ),
  })
  .describe(
    "Architectural fit assessment: can the requirement be solved with existing " +
      "patterns or does the architecture need to be extended?",
  );

export type ArchitecturalFit = z.infer<typeof ArchitecturalFitSchema>;
