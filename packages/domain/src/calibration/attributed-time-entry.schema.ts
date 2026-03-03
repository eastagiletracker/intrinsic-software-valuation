import { z } from "zod";

import { TicketIdSchema } from "../shared/ticket-id.schema.js";
import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";

/**
 * Time entry after cluster-level attribution by the calibration service.
 *
 * Extends the raw TimeEntry with attribution results:
 * - Which cluster the hours were assigned to
 * - How many hours were actually attributed (after splitting)
 * - Why the attribution was made (audit trail)
 *
 * Produced by the calibration service, not the time-tracking client.
 */
export const AttributedTimeEntrySchema = z
  .object({
    timestamp: IsoTimestampSchema.describe("When the work was performed"),
    originalDurationHours: z
      .number()
      .positive()
      .describe("Original duration before any splitting"),
    attributedClusterId: TicketIdSchema.optional().describe(
      "Cluster this entry was attributed to. " +
        "Absent for KBV and UNLINKED_OVERHEAD entries.",
    ),
    attributedHours: z
      .number()
      .nonnegative()
      .describe(
        "Hours attributed to this cluster after splitting. " +
          "May differ from original duration for MULTI_ID_SPLIT entries.",
      ),
    attributionReason: z
      .string()
      .describe(
        "Human-readable explanation of the attribution decision. " +
          "Provides audit trail for calibration data quality.",
      ),
  })
  .describe(
    "Time entry attributed to a specific cluster by the calibration service. " +
      "Contains the attribution decision and effective hours after splitting.",
  );

export type AttributedTimeEntry = z.infer<typeof AttributedTimeEntrySchema>;
