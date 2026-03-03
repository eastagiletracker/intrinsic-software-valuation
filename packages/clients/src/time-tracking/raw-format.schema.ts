import { z } from "zod";

/**
 * Supported raw formats for time-tracking data sources.
 *
 * Each value maps to a concrete adapter that the factory resolves
 * when creating a `TimeTrackingClient`.
 */
export const TimeTrackingRawFormatSchema = z
  .enum(["teamleader-excel"])
  .describe(
    "Raw format identifier for time-tracking source data. " +
      "Determines which adapter the factory instantiates.",
  );

export type TimeTrackingRawFormat = z.infer<typeof TimeTrackingRawFormatSchema>;
