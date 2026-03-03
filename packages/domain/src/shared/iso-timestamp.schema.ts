import { z } from "zod";

/**
 * ISO 8601 timestamp string with timezone information.
 *
 * Used for all temporal references across the ISV Engine:
 * ticket creation dates, Git checkout targets, time tracking entries,
 * and baseline timestamps (T0).
 */
export const IsoTimestampSchema = z
  .string()
  .datetime()
  .describe(
    'ISO 8601 timestamp with timezone, e.g. "2024-03-01T10:00:00Z". ' +
      "Used for ticket dates, checkout targets, and time entries.",
  );

export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;
