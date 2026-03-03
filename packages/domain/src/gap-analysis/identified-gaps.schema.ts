import { z } from "zod";

/**
 * Gap identification across the four structural dimensions.
 *
 * Each dimension has a boolean flag, a description, and optionally
 * a list of specific missing items (entities, adapters).
 */

/** Data dimension: missing entities or schema extensions. */
export const DataGapSchema = z
  .object({
    hasGap: z.boolean().describe("Whether a data/schema gap was identified"),
    missingEntities: z
      .array(z.string())
      .describe(
        "List of missing entities or schema elements, e.g. ['Lead', 'Invoice']",
      ),
    description: z
      .string()
      .describe("Explanation of the data gap or why none exists"),
  })
  .describe(
    "Data gap analysis: missing entities, schema extensions, or migrations.",
  );

export type DataGap = z.infer<typeof DataGapSchema>;

/** UI/UX dimension: custom UI beyond established frontend patterns. */
export const UiGapSchema = z
  .object({
    hasGap: z.boolean().describe("Whether a UI/UX gap was identified"),
    description: z
      .string()
      .describe("Explanation of the UI gap or why none exists"),
  })
  .describe(
    "UI/UX gap analysis: need for custom UI components or complex frontend state.",
  );

export type UiGap = z.infer<typeof UiGapSchema>;

/** Logic dimension: complex new business logic beyond CRUD. */
export const LogicGapSchema = z
  .object({
    hasGap: z.boolean().describe("Whether a logic gap was identified"),
    description: z
      .string()
      .describe("Explanation of the logic gap or why none exists"),
  })
  .describe(
    "Logic gap analysis: need for new business rules, transformations, or algorithms.",
  );

export type LogicGap = z.infer<typeof LogicGapSchema>;

/** Integration dimension: new third-party connections. */
export const IntegrationGapSchema = z
  .object({
    hasGap: z.boolean().describe("Whether an integration gap was identified"),
    missingAdapters: z
      .array(z.string())
      .describe(
        "List of missing adapters or integrations, e.g. ['Salesforce API', 'Stripe']",
      ),
    description: z
      .string()
      .describe("Explanation of the integration gap or why none exists"),
  })
  .describe(
    "Integration gap analysis: missing adapters, third-party APIs, or infrastructure.",
  );

export type IntegrationGap = z.infer<typeof IntegrationGapSchema>;

/** All four gap dimensions combined. */
export const IdentifiedGapsSchema = z
  .object({
    data: DataGapSchema,
    ui: UiGapSchema,
    logic: LogicGapSchema,
    integration: IntegrationGapSchema,
  })
  .describe(
    "Structural gaps across all four dimensions: data, UI/UX, logic, and integration. " +
      "Produced by the Gap Analyzer after comparing ticket requirements with the system baseline.",
  );

export type IdentifiedGaps = z.infer<typeof IdentifiedGapsSchema>;
