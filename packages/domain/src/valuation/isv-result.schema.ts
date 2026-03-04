import { z } from "zod";

import { TicketIdSchema } from "../shared/ticket-id.schema.js";
import { IsvFactorsSchema } from "./isv-factors.schema.js";
import { IsvBreakdownSchema } from "./isv-breakdown.schema.js";

/**
 * Final ISV calculation result for a single ticket.
 *
 * Produced by the Valuation Engine (phase 3) as a pure deterministic
 * calculation — no AI involved. Contains all input factors, the formula
 * breakdown, and the final ISV score.
 *
 * Every result carries an explicit formula version identifier because
 * ISV scores become part of legal contracts and must remain traceable
 * to the exact formula that produced them.
 *
 * This is the primary output of both the standalone ISV calculation pipeline
 * and the per-cluster step in historical calibration.
 */
export const IsvResultSchema = z
  .object({
    formulaVersion: z
      .string()
      .min(1)
      .describe(
        "Semantic version of the ISV formula used for this calculation, e.g. '3.4'. " +
          "Required for legal traceability — ISV scores appear in contracts. " +
          "A change to the formula structure, factor scales, or C2 derivation model " +
          "constitutes a new version.",
      ),
    ticketId: TicketIdSchema.describe(
      "ID of the ticket this ISV was calculated for",
    ),
    factors: IsvFactorsSchema.describe(
      "All six input factors used in the calculation",
    ),
    breakdown: IsvBreakdownSchema.describe(
      "Intermediate formula steps for transparency",
    ),
    isvScore: z
      .number()
      .nonnegative()
      .describe(
        "Final Intrinsic Software Value: ((A1 × A2) + B1) × (C1 × C2) × D3. " +
          "Dimensionless metric representing structural size and complexity.",
      ),
  })
  .describe(
    "Complete ISV calculation result: formula version, input factors, breakdown, and final score. " +
      "Produced by the Valuation Engine. Can be written back to the ticket system.",
  );

export type IsvResult = z.infer<typeof IsvResultSchema>;
