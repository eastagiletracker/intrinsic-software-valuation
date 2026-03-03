import { z } from "zod";

import { IsoTimestampSchema, TicketIdSchema } from "@isv/domain";

/**
 * Query schema for the `TimeTrackingClient.getTimeSheet()` method.
 *
 * Supports three filtering modes (combinable with logical AND):
 *  - **all** — omit both `ticketIds` and `timeframe` to get everything
 *  - **by ticket numbers** — provide `ticketIds` to filter entries
 *  - **by timeframe** — provide `start` and `end` to filter entries
 *
 * When both filters are present they are combined with AND semantics.
 */
export const TimeTrackingQuerySchema = z
  .object({
    ticketIds: z
      .array(TicketIdSchema)
      .min(1)
      .optional()
      .describe(
        'Ticket IDs to filter by, e.g. ["PROJ-123", "PROJ-456"]. ' +
          "Only entries whose detectedIds contain at least one match are returned.",
      ),
    timeframe: z
      .object({
        start: IsoTimestampSchema.describe(
          "Inclusive start of the timeframe filter (ISO 8601)",
        ),
        end: IsoTimestampSchema.describe(
          "Inclusive end of the timeframe filter (ISO 8601)",
        ),
      })
      .optional()
      .describe(
        "Timeframe filter. Both bounds are inclusive: start <= timestamp <= end.",
      ),
  })
  .describe(
    "Query for the time-tracking client. " +
      "Omit all fields for the full time sheet; combine filters with AND.",
  );

export type TimeTrackingQuery = z.infer<typeof TimeTrackingQuerySchema>;
