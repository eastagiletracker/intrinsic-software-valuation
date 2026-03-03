import { z } from "zod";

/**
 * ISV formula breakdown showing intermediate calculation steps.
 *
 * Makes the formula transparent and auditable:
 *   ISV = poValue × archFactor × qualityMultiplier
 *   where poValue = (A1 × A2) + B1
 *   and archFactor = C1 × C2
 *   and qualityMultiplier = D3
 */
export const IsvBreakdownSchema = z
  .object({
    poValue: z
      .number()
      .describe(
        "Functional value: (A1 × A2) + B1. " +
          "Represents what is being built — data volume, UI depth, and logic.",
      ),
    archFactor: z
      .number()
      .describe(
        "Architecture factor: C1 × C2. " +
          "Technical leverage and systemic risk from integration depth and technical debt.",
      ),
    qualityMultiplier: z
      .number()
      .describe(
        "Quality multiplier: D3. " +
          "Amplifies ISV for elevated Definition of Done requirements.",
      ),
  })
  .describe(
    "Intermediate calculation steps of the ISV formula for transparency and auditing. " +
      "ISV = poValue × archFactor × qualityMultiplier.",
  );

export type IsvBreakdown = z.infer<typeof IsvBreakdownSchema>;
