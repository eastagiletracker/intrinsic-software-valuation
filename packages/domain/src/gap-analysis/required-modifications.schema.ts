import { z } from "zod";

/**
 * Required modifications derived from the gap analysis.
 *
 * Provides a concrete to-do list for developers:
 * architecture extensions (structural) and action items (implementation tasks).
 */
export const RequiredModificationsSchema = z
  .object({
    architectureExtensions: z
      .array(z.string())
      .describe(
        "Structural changes needed, e.g. 'Introduce outbound adapter for Salesforce', " +
          "'Add retry handling for API failures'",
      ),
    actionItems: z
      .array(z.string())
      .describe(
        "Implementation tasks, e.g. 'Store Salesforce credentials securely', " +
          "'Map internal Lead DTO to Salesforce model'",
      ),
  })
  .describe(
    "Actionable to-do list of required architecture extensions and implementation tasks " +
      "derived from the identified gaps.",
  );

export type RequiredModifications = z.infer<typeof RequiredModificationsSchema>;
