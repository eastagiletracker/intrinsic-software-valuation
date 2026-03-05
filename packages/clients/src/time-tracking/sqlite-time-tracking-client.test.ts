import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { TimeEntry } from "@isv/domain";

import { SqliteDataStore } from "../cache/sqlite-data-store.js";

import { SqliteTimeTrackingClient } from "./sqlite-time-tracking-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testDir = join("/tmp", "sqlite-tt-client-test-" + Date.now());

function makeTimeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    timestamp: "2026-01-15T09:00:00.000Z",
    durationHours: 2.5,
    rawComment: "PROJ-100 implementation work",
    detectedIds: ["PROJ-100"],
    attributionType: "DIRECT",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SqliteTimeTrackingClient", () => {
  let dbPath: string;
  let client: SqliteTimeTrackingClient;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, `project-${Date.now()}.db`);

    // Pre-populate the database
    const store = new SqliteDataStore(dbPath);
    store.insertTimeEntries(
      [
        makeTimeEntry({
          timestamp: "2026-01-10T08:00:00.000Z",
          detectedIds: ["PROJ-1"],
          rawComment: "PROJ-1 work",
        }),
        makeTimeEntry({
          timestamp: "2026-02-10T08:00:00.000Z",
          detectedIds: ["PROJ-2"],
          rawComment: "PROJ-2 work",
        }),
        makeTimeEntry({
          timestamp: "2026-02-15T08:00:00.000Z",
          detectedIds: ["PROJ-1", "PROJ-3"],
          rawComment: "PROJ-1 PROJ-3 split work",
          attributionType: "MULTI_ID_SPLIT",
        }),
        makeTimeEntry({
          timestamp: "2026-03-10T08:00:00.000Z",
          detectedIds: ["PROJ-3"],
          rawComment: "PROJ-3 work",
        }),
      ],
      { sourceSystem: "excel", sourceFile: "hours.xlsx" },
    );
    store.close();

    client = new SqliteTimeTrackingClient(dbPath);
  });

  afterEach(() => {
    client.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // No query (all entries)
  // -----------------------------------------------------------------------

  it("returns all entries when no query is provided", async () => {
    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toHaveLength(4);
    expect(sheet.sourceSystem).toBe("excel");
  });

  it("derives periodStart and periodEnd from actual data", async () => {
    const sheet = await client.getTimeSheet();
    expect(sheet.periodStart).toBe("2026-01-10T08:00:00.000Z");
    expect(sheet.periodEnd).toBe("2026-03-10T08:00:00.000Z");
  });

  // -----------------------------------------------------------------------
  // Filter by ticketIds
  // -----------------------------------------------------------------------

  it("filters entries by ticketIds", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-1"],
    });
    expect(sheet.entries).toHaveLength(2); // direct PROJ-1 + split PROJ-1/PROJ-3
  });

  it("filters entries by multiple ticketIds", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-2", "PROJ-3"],
    });
    expect(sheet.entries).toHaveLength(3); // PROJ-2, PROJ-1/PROJ-3 split, PROJ-3
  });

  it("returns empty sheet for non-matching ticketIds", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-999"],
    });
    expect(sheet.entries).toHaveLength(0);
    expect(sheet.rawEntryCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Filter by timeframe
  // -----------------------------------------------------------------------

  it("filters entries by timeframe", async () => {
    const sheet = await client.getTimeSheet({
      timeframe: {
        start: "2026-02-01T00:00:00.000Z",
        end: "2026-02-28T00:00:00.000Z",
      },
    });
    expect(sheet.entries).toHaveLength(2);
    expect(sheet.periodStart).toBe("2026-02-10T08:00:00.000Z");
    expect(sheet.periodEnd).toBe("2026-02-15T08:00:00.000Z");
  });

  // -----------------------------------------------------------------------
  // Combined filters
  // -----------------------------------------------------------------------

  it("combines ticketIds and timeframe filters", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-1"],
      timeframe: {
        start: "2026-02-01T00:00:00.000Z",
        end: "2026-02-28T00:00:00.000Z",
      },
    });
    // Only the split entry in Feb that includes PROJ-1
    expect(sheet.entries).toHaveLength(1);
    expect(sheet.entries[0].rawComment).toBe("PROJ-1 PROJ-3 split work");
  });

  // -----------------------------------------------------------------------
  // Empty database
  // -----------------------------------------------------------------------

  it("returns empty time sheet from empty database", async () => {
    client.close();
    const emptyDbPath = join(testDir, `empty-${Date.now()}.db`);
    const emptyStore = new SqliteDataStore(emptyDbPath);
    emptyStore.close();

    client = new SqliteTimeTrackingClient(emptyDbPath);
    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toHaveLength(0);
    expect(sheet.rawEntryCount).toBe(0);
  });
});
