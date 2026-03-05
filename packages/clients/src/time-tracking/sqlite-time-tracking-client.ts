import type { TimeSheet } from "@isv/domain";

import { SqliteDataStore } from "../cache/sqlite-data-store.js";
import type { SourceFileMeta } from "../cache/sqlite-data-store.js";

import type { TimeTrackingClient } from "./client.js";
import type { TimeTrackingQuery } from "./query.schema.js";

// ---------------------------------------------------------------------------
// SqliteTimeTrackingClient
// ---------------------------------------------------------------------------

/**
 * SQLite-backed implementation of `TimeTrackingClient`.
 *
 * Reads time entries from a pre-warmed `project.db` SQLite database instead
 * of parsing raw Excel files on every query.
 */
export class SqliteTimeTrackingClient implements TimeTrackingClient {
  private readonly store: SqliteDataStore;

  constructor(
    dbPath: string,
    sourceFiles?: SourceFileMeta[],
  ) {
    this.store = new SqliteDataStore(dbPath);

    // Emit staleness warning if source files are provided
    if (sourceFiles && this.store.isStale(sourceFiles)) {
      console.error(
        "[warn] SQLite database is stale — source files have changed. " +
          "Run 'isv init --warmup --project <slug>' to refresh.",
      );
    }
  }

  async getTimeSheet(query?: TimeTrackingQuery): Promise<TimeSheet> {
    const entries = this.store.queryTimeEntries({
      ticketIds: query?.ticketIds,
      timeframe: query?.timeframe,
    });

    if (entries.length === 0) {
      const now = new Date().toISOString();
      return {
        periodStart: query?.timeframe?.start ?? now,
        periodEnd: query?.timeframe?.end ?? now,
        sourceSystem: "sqlite",
        rawEntryCount: 0,
        entries: [],
      };
    }

    // Derive period bounds from actual data
    const timestamps = entries.map((e) => new Date(e.timestamp).getTime());
    const periodStart = new Date(Math.min(...timestamps)).toISOString();
    const periodEnd = new Date(Math.max(...timestamps)).toISOString();

    // Strip source metadata that doesn't belong on TimeEntry
    const domainEntries = entries.map((e) => ({
      timestamp: e.timestamp,
      durationHours: e.durationHours,
      rawComment: e.rawComment,
      detectedIds: e.detectedIds,
      attributionType: e.attributionType,
    }));

    return {
      periodStart,
      periodEnd,
      sourceSystem: entries[0].sourceSystem,
      rawEntryCount: domainEntries.length,
      entries: domainEntries,
    };
  }

  close(): void {
    this.store.close();
  }
}
