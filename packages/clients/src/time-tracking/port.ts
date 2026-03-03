import type { TimeSheet } from "@isv/domain";

/**
 * Source-agnostic port for time-tracking adapters.
 *
 * Any adapter (Teamleader Excel, Harvest CSV, Clockify API, …) must implement
 * this interface so that the calibration service can consume time entries
 * without knowing the source-system specifics.
 *
 * The single `parse` method returns a `TimeSheet` — the domain container that
 * wraps `TimeEntry[]` with period metadata and provenance information.
 */
export interface TimeTrackingPort {
  /**
   * Parse the source at the given path and return a standardised `TimeSheet`.
   *
   * @param filePath - Absolute or relative path to the source file.
   * @returns A `Promise` that resolves with the parsed, L1-cleaned `TimeSheet`.
   */
  parse(filePath: string): Promise<TimeSheet>;
}
