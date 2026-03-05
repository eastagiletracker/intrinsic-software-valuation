import { z } from "zod";

import { TicketIdSchema, IsoTimestampSchema } from "@isv/domain";

/**
 * Query schema for the `TicketClient.getTickets()` method.
 *
 * Supports three query modes (mutually exclusive via discriminated union):
 *  - **all** — no filter, returns every parsed ticket
 *  - **byTicketNumbers** — accepts a list of ticket IDs to match against `ticketId`
 *  - **withSubtasks** — accepts a list of parent ticket IDs and returns those
 *    tickets plus all tickets whose `parentId` matches any given ID
 *
 * All modes support an optional `timeframe` filter that restricts results
 * to tickets whose resolution date (updatedAt for resolved) or creation date
 * (for unresolved) falls within the specified range.
 */

const TimeframeFilterSchema = z
  .object({
    start: IsoTimestampSchema.describe(
      "Inclusive start of the timeframe filter (ISO 8601)",
    ),
    end: IsoTimestampSchema.describe(
      "Inclusive end of the timeframe filter (ISO 8601)",
    ),
  })
  .describe(
    "Timeframe filter for tickets. Filters by resolution date (updatedAt) " +
      "for resolved tickets, or creation date for unresolved tickets.",
  );

export const TicketQuerySchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("all").describe("Return all parsed tickets"),
      timeframe: TimeframeFilterSchema.optional(),
    })
    .describe("All-tickets query — no filtering applied"),
  z
    .object({
      mode: z
        .literal("byTicketNumbers")
        .describe("Filter tickets by a list of ticket IDs"),
      ticketIds: z
        .array(TicketIdSchema)
        .min(1)
        .describe(
          'Ticket IDs to match, e.g. ["PROJ-123", "PROJ-456"]. ' +
            "Only tickets whose ticketId is in this list are returned.",
        ),
      timeframe: TimeframeFilterSchema.optional(),
    })
    .describe("Filter tickets by explicit ticket IDs"),
  z
    .object({
      mode: z
        .literal("withSubtasks")
        .describe(
          "Return parent tickets and their direct children (single-level expansion)",
        ),
      parentIds: z
        .array(TicketIdSchema)
        .min(1)
        .describe(
          "Parent ticket IDs. Returns each parent plus every ticket whose " +
            "parentId matches one of these IDs.",
        ),
      timeframe: TimeframeFilterSchema.optional(),
    })
    .describe(
      "Cluster-resolution query: parent tickets plus their direct subtasks",
    ),
]);

export type TicketQuery = z.infer<typeof TicketQuerySchema>;
