import { z } from "zod";

import { TicketIdSchema } from "@isv/domain";

/**
 * Query schema for the `TicketClient.getTickets()` method.
 *
 * Supports three query modes (mutually exclusive via discriminated union):
 *  - **all** — no filter, returns every parsed ticket
 *  - **byTicketNumbers** — accepts a list of ticket IDs to match against `ticketId`
 *  - **withSubtasks** — accepts a list of parent ticket IDs and returns those
 *    tickets plus all tickets whose `parentId` matches any given ID
 */
export const TicketQuerySchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("all").describe("Return all parsed tickets"),
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
    })
    .describe(
      "Cluster-resolution query: parent tickets plus their direct subtasks",
    ),
]);

export type TicketQuery = z.infer<typeof TicketQuerySchema>;
