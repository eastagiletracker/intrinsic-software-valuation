import { z } from "zod";

import { D3QualityScale } from "./isv-factor-scales.schema.js";

/**
 * Project-level configuration for an ISV analysis run.
 *
 * Provides defaults that apply to all tickets within a project unless
 * overridden at the ticket level. Contains the D3 quality floor and
 * the legacy daily rate used to convert hours into Euro for reporting.
 */
export const ProjectConfigSchema = z
  .object({
    d3QualityFloor: D3QualityScale.default(1).describe(
      "Minimum D3 Quality Multiplier for the project. " +
        "The Gap Analyzer uses this as a floor: if the ticket signals a " +
        "higher D3, the ticket value wins; otherwise this floor applies. " +
        "Defaults to 1 (standard Definition of Done).",
    ),
    legacyDailyRate: z
      .number()
      .positive()
      .default(1000)
      .describe(
        "Legacy daily rate in Euro (€) for an 8-hour working day. " +
          "Used to convert the hours-based Ship Rate into € per ISV for reporting. " +
          "Defaults to 1,000 €/day (125 €/h).",
      ),
  })
  .describe(
    "Project-level ISV configuration. " +
      "Provides baseline defaults (e.g. D3 quality floor, legacy daily rate) " +
      "that apply to all tickets unless overridden by ticket-level signals " +
      "detected during gap analysis.",
  );

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
