import { z } from "zod";

/**
 * Supported raw formats for ticket data sources.
 *
 * Each value maps to a concrete adapter that the factory resolves
 * when creating a `TicketClient`.
 */
export const TicketRawFormatSchema = z
  .enum(["jira-xml"])
  .describe(
    "Raw format identifier for ticket source data. " +
      "Determines which adapter the factory instantiates.",
  );

export type TicketRawFormat = z.infer<typeof TicketRawFormatSchema>;
