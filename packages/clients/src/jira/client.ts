import type { Result, Ticket } from "@isv/domain";

import type { TicketQuery } from "./query.schema.js";

/**
 * High-level ticket client interface.
 *
 * Provides filtered access to normalised tickets parsed from all source
 * files in the configured data folder. Callers never need to know the
 * underlying raw format or file layout.
 */
export interface TicketClient {
  /**
   * Retrieve tickets, optionally filtered by the given query.
   *
   * @param query - Optional query criteria (all, byTicketNumbers, withSubtasks).
   *                Omit to retrieve all tickets.
   * @returns A `Promise` resolving to a `Result<Ticket[]>`.
   */
  getTickets(query?: TicketQuery): Promise<Result<Ticket[]>>;
}
