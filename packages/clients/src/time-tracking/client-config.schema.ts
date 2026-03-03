import { z } from "zod";

import { TimeTrackingRawFormatSchema } from "./raw-format.schema.js";

/**
 * Configuration for initialising a `TimeTrackingClient`.
 *
 * Provides the project-specific context the factory needs to resolve
 * the correct adapter and locate source files on disk.
 */
export const TimeTrackingClientConfigSchema = z
  .object({
    ticketPrefix: z
      .string()
      .min(1)
      .regex(/^[A-Z]+$/, "ticketPrefix must be a non-empty uppercase string")
      .describe(
        'Uppercase ticket prefix used to scope ID detection, e.g. "PROJ"',
      ),
    dataFolderName: z
      .string()
      .min(1)
      .describe(
        'Name of the client data folder inside data/, e.g. "superclient"',
      ),
    rawFormat: TimeTrackingRawFormatSchema.describe(
      "Raw format identifier that determines which adapter is used",
    ),
  })
  .describe(
    "Project-specific configuration for the time-tracking client factory.",
  );

export type TimeTrackingClientConfig = z.infer<
  typeof TimeTrackingClientConfigSchema
>;
