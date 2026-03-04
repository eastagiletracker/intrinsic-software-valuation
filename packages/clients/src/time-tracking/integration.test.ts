import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTimeTrackingClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Client integration tests — full factory → adapter → domain path
// Uses the committed fixture placed into a temp data folder.
// ---------------------------------------------------------------------------

const FIXTURE_XLSX = resolve(
  import.meta.dirname,
  "teamleader-excel",
  "__fixtures__",
  "sample-timesheet.xlsx",
);
const DATA_DIR = resolve(
  "data",
  "__test-timetracking-integration__",
  "time-tracking",
);

describe("TimeTrackingClient — fixture integration", () => {
  beforeEach(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await copyFile(FIXTURE_XLSX, resolve(DATA_DIR, "sample.xlsx"));
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-timetracking-integration__"), {
      recursive: true,
      force: true,
    });
  });

  it("creates a client and fetches all time entries", async () => {
    const client = await createTimeTrackingClient({
      dataFolderName: "__test-timetracking-integration__",
      ticketPrefix: "ACME",
      rawFormat: "teamleader-excel",
    });

    const sheet = await client.getTimeSheet();
    // 12 rows, 1 filtered (0.05h) → 11 entries
    expect(sheet.entries).toHaveLength(11);
    expect(sheet.rawEntryCount).toBe(12);
    expect(sheet.sourceSystem).toBe("teamleader");
  });

  it("filters by ticket IDs scoped to prefix", async () => {
    const client = await createTimeTrackingClient({
      dataFolderName: "__test-timetracking-integration__",
      ticketPrefix: "ACME",
      rawFormat: "teamleader-excel",
    });

    const sheet = await client.getTimeSheet({
      ticketIds: ["ACME-200"],
    });
    // Two entries reference ACME-200 directly
    expect(sheet.entries.length).toBeGreaterThanOrEqual(1);
    for (const entry of sheet.entries) {
      expect(entry.detectedIds).toContain("ACME-200");
    }
  });

  it("filters by timeframe", async () => {
    const client = await createTimeTrackingClient({
      dataFolderName: "__test-timetracking-integration__",
      ticketPrefix: "ACME",
      rawFormat: "teamleader-excel",
    });

    const sheet = await client.getTimeSheet({
      timeframe: {
        start: "2025-03-12T00:00:00.000Z",
        end: "2025-03-13T23:59:59.000Z",
      },
    });
    // Entries on 12 and 13 March only
    for (const entry of sheet.entries) {
      const ts = new Date(entry.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(
        new Date("2025-03-12T00:00:00.000Z").getTime(),
      );
      expect(ts).toBeLessThanOrEqual(
        new Date("2025-03-13T23:59:59.000Z").getTime(),
      );
    }
    expect(sheet.entries.length).toBeGreaterThan(0);
  });

  it("returns empty sheet when data folder does not exist", async () => {
    const client = await createTimeTrackingClient({
      dataFolderName: "__nonexistent_fixture__",
      ticketPrefix: "ACME",
      rawFormat: "teamleader-excel",
    });

    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toEqual([]);
  });
});
