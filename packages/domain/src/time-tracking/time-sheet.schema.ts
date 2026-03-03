import { z } from "zod";

import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";
import { TimeEntrySchema } from "./time-entry.schema.js";

/**
 * Container for a batch of standardized time entries (L1) with
 * period and source metadata.
 *
 * Produced by the time-tracking client as the final output of
 * the L0 → L1 parsing pipeline. Consumed by the calibration service.
 *
 * The metadata captures provenance and data-quality context that
 * the calibration service needs for period matching and quality scoring.
 */
export const TimeSheetSchema = z
  .object({
    periodStart: IsoTimestampSchema.describe(
      "Inclusive start of the time-tracking period (ISO 8601)",
    ),
    periodEnd: IsoTimestampSchema.describe(
      "Inclusive end of the time-tracking period (ISO 8601)",
    ),
    sourceSystem: z
      .string()
      .min(1)
      .describe(
        "Identifier for the time-tracking source, e.g. 'harvest', 'toggl', 'excel'",
      ),
    sourceFile: z
      .string()
      .optional()
      .describe(
        "Original file name or URL for audit trail. " +
          "Optional because some sources are API-based.",
      ),
    rawEntryCount: z
      .number()
      .int()
      .nonnegative()
      .describe(
        "Number of entries before L1 cleaning. " +
          "Difference to entries.length reveals how many were filtered out.",
      ),
    entries: z
      .array(TimeEntrySchema)
      .describe("Standardized time entries after L1 cleaning"),
  })
  .describe(
    "Time sheet container with period metadata and cleaned entries. " +
      "Output of the time-tracking client, input for the calibration service.",
  );

export type TimeSheet = z.infer<typeof TimeSheetSchema>;
