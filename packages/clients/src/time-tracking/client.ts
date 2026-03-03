import type { TimeSheet } from "@isv/domain";

import type { TimeTrackingQuery } from "./query.schema.js";

/**
 * High-level time-tracking client interface.
 *
 * Provides filtered access to a merged `TimeSheet` built from all source
 * files in the configured data folder. Callers never need to know the
 * underlying raw format or file layout.
 */
export interface TimeTrackingClient {
  /**
   * Retrieve the time sheet, optionally filtered by the given query.
   *
   * @param query - Optional filter criteria (ticket IDs and/or timeframe).
   *                Omit to retrieve the full, unfiltered time sheet.
   * @returns A `Promise` resolving to the (possibly filtered) `TimeSheet`.
   */
  getTimeSheet(query?: TimeTrackingQuery): Promise<TimeSheet>;
}
