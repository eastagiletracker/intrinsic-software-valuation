import { z } from "zod";

import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";
import { TicketIdSchema } from "../shared/ticket-id.schema.js";
import { AttributionTypeSchema } from "./attribution-type.schema.js";

/**
 * Standardized time tracking entry (L1 level).
 *
 * Produced by the time-tracking client after parsing raw time logs (L0).
 * Contains the normalized duration, raw comment, detected ticket IDs,
 * and the attribution strategy used during parsing.
 *
 * This is the output of the time-tracking client and the input for
 * the calibration service which performs cluster-level attribution.
 *
 * Data cleaning rules (L0 → L1) are defined by the client implementation
 * and may vary per source system.
 */
export const TimeEntrySchema = z
  .object({
    timestamp: IsoTimestampSchema.describe(
      "When the work was performed (date/time of the booking)",
    ),
    durationHours: z
      .number()
      .positive()
      .describe("Duration in hours. Must be > 0 after L1 cleaning."),
    rawComment: z
      .string()
      .describe(
        "Original booking comment as entered by the developer. " +
          "Used for ticket ID detection and audit trail.",
      ),
    detectedIds: z
      .array(TicketIdSchema)
      .describe(
        "Ticket IDs detected in the comment via regex matching. " +
          "Empty array for KBV entries. May contain IDs from different clusters.",
      ),
    attributionType: AttributionTypeSchema.describe(
      "How this entry was attributed to ticket(s) during parsing",
    ),
  })
  .describe(
    "Standardized time entry after L1 parsing and cleaning. " +
      "Produced by the time-tracking client. Input for calibration attribution.",
  );

export type TimeEntry = z.infer<typeof TimeEntrySchema>;
