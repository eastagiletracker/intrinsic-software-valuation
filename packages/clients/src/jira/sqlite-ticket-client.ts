import { existsSync } from "node:fs";

import type { Result, Ticket } from "@isv/domain";

import { SqliteDataStore } from "../cache/sqlite-data-store.js";
import type { SourceFileMeta } from "../cache/sqlite-data-store.js";

import type { TicketClient } from "./client.js";
import type { TicketQuery } from "./query.schema.js";

// ---------------------------------------------------------------------------
// SqliteTicketClient
// ---------------------------------------------------------------------------

/**
 * SQLite-backed implementation of `TicketClient`.
 *
 * Reads tickets from a pre-warmed `project.db` SQLite database instead of
 * parsing raw XML files on every query. The database must be populated by
 * running `isv init --warmup --project <slug>` first.
 */
export class SqliteTicketClient implements TicketClient {
  private readonly store: SqliteDataStore;

  constructor(
    private readonly dbPath: string,
    private readonly sourceFiles?: SourceFileMeta[],
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

  async getTickets(query?: TicketQuery): Promise<Result<Ticket[]>> {
    if (!existsSync(this.dbPath)) {
      return {
        success: false,
        error: {
          code: "SQLITE_DB_NOT_FOUND",
          message:
            "SQLite database not found. Run 'isv init --warmup --project <slug>' first.",
          source: "sqlite-ticket-client",
        },
      };
    }

    try {
      let tickets: Ticket[];

      if (!query) {
        tickets = this.store.getAllTickets();
      } else {
        switch (query.mode) {
          case "all":
            tickets = this.store.getAllTickets();
            break;

          case "byTicketNumbers":
            tickets = this.store.getTicketsByIds(query.ticketIds);
            break;

          case "withSubtasks":
            tickets = this.store.getTicketsWithSubtasks(query.parentIds);
            break;
        }

        // Apply optional timeframe filter
        if (query.timeframe) {
          const startMs = new Date(query.timeframe.start).getTime();
          const endMs = new Date(query.timeframe.end).getTime();
          tickets = tickets.filter((t) => {
            const dateMs = new Date(t.updatedAt).getTime();
            return dateMs >= startMs && dateMs <= endMs;
          });
        }
      }

      return { success: true, data: tickets };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "SQLITE_QUERY_FAILED",
          message: err instanceof Error ? err.message : String(err),
          source: "sqlite-ticket-client",
        },
      };
    }
  }

  close(): void {
    this.store.close();
  }
}
