import type { Ticket } from "@isv/domain";

/**
 * Source-agnostic port for ticket adapters.
 *
 * Any adapter (Jira XML, Azure DevOps CSV, REST API, …) must implement
 * this interface so that the ticket client can consume tickets without
 * knowing the source-system specifics.
 *
 * The single `parse` method returns a `Ticket[]` — the normalised
 * domain representation of tickets from the source.
 */
export interface TicketPort {
  /**
   * Parse the source at the given path and return normalised tickets.
   *
   * @param filePath - Absolute or relative path to the source file.
   * @returns A `Promise` that resolves with the parsed `Ticket[]`.
   */
  parse(filePath: string): Promise<Ticket[]>;
}
