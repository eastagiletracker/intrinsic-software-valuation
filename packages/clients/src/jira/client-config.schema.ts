import { z } from "zod";

import { TicketRawFormatSchema } from "./raw-format.schema.js";

/**
 * Configuration for initialising a `TicketClient`.
 *
 * Provides the project-specific context the factory needs to resolve
 * the correct adapter and locate source files on disk.
 */
export const TicketClientConfigSchema = z
  .object({
    dataFolderName: z
      .string()
      .min(1)
      .describe(
        'Name of the client data folder inside data/, e.g. "superclient". ' +
          "Resolves to data/<dataFolderName>/tickets/",
      ),
    ticketPrefix: z
      .string()
      .min(1)
      .regex(/^[A-Z]+$/, "ticketPrefix must be a non-empty uppercase string")
      .describe(
        'Uppercase ticket prefix used for identification and filtering, e.g. "PROJ"',
      ),
    rawFormat: TicketRawFormatSchema.describe(
      "Raw format identifier that determines which adapter is used",
    ),
  })
  .describe("Project-specific configuration for the ticket client factory.");

export type TicketClientConfig = z.infer<typeof TicketClientConfigSchema>;
