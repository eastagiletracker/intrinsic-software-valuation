import { z } from "zod";

import { TimeTrackingRawFormatSchema } from "./raw-format.schema.js";

/**
 * Configuration for a single time-tracking source.
 *
 * Each source maps to a subfolder inside `data/<dataFolderName>/time-tracking/`
 * and a specific adapter determined by `rawFormat`.
 */
export const TimeTrackingSourceSchema = z
  .object({
    rawFormat: TimeTrackingRawFormatSchema.describe(
      "Raw format identifier that determines which adapter is used",
    ),
    subFolder: z
      .string()
      .min(1)
      .describe(
        'Subfolder name inside time-tracking/, e.g. "teamleader" or "projektron-bcs"',
      ),
  })
  .describe("Configuration for a single time-tracking source.");

export type TimeTrackingSource = z.infer<typeof TimeTrackingSourceSchema>;

/**
 * Configuration for initialising a `TimeTrackingClient`.
 *
 * Provides the project-specific context the factory needs to resolve
 * the correct adapter(s) and locate source files on disk.
 *
 * Supports two modes:
 * - **Legacy (single format):** `rawFormat` is set directly; files are
 *   discovered at `data/<dataFolderName>/time-tracking/`.
 * - **Multi-source:** `sources` array is set; each source points to a
 *   subfolder with its own format adapter.
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
    rawFormat: TimeTrackingRawFormatSchema.optional().describe(
      "Legacy: single raw format identifier. Use `sources` for multi-format setups.",
    ),
    sources: z
      .array(TimeTrackingSourceSchema)
      .min(1)
      .optional()
      .describe(
        "Multi-source configuration. Each entry maps a subfolder to a format adapter.",
      ),
  })
  .refine((cfg) => cfg.rawFormat !== undefined || cfg.sources !== undefined, {
    message:
      "Either 'rawFormat' (legacy) or 'sources' (multi-format) must be provided.",
  })
  .describe(
    "Project-specific configuration for the time-tracking client factory.",
  );

export type TimeTrackingClientConfig = z.infer<
  typeof TimeTrackingClientConfigSchema
>;
