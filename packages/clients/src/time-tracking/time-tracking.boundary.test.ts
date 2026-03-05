import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTimeTrackingClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Tier 3 — component boundary test
// Full factory → adapter → domain path within the time-tracking client package.
// Fixture-derived data placed into a temp data folder; no external I/O.
// ---------------------------------------------------------------------------

const TL_FIXTURE_XLSX = resolve(
  import.meta.dirname,
  "teamleader-excel",
  "__fixtures__",
  "sample-timesheet.xlsx",
);
const PB_FIXTURE_XLSX = resolve(
  import.meta.dirname,
  "projektron-bcs-excel",
  "__fixtures__",
  "sample-timesheet.xlsx",
);
const DATA_DIR = resolve(
  "data",
  "__test-timetracking-integration__",
  "time-tracking",
);

describe("TimeTrackingClient — component boundary", () => {
  beforeEach(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await copyFile(TL_FIXTURE_XLSX, resolve(DATA_DIR, "sample.xlsx"));
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

// ---------------------------------------------------------------------------
// Multi-source boundary test
// ---------------------------------------------------------------------------

describe("TimeTrackingClient — multi-source boundary", () => {
  const tlDir = resolve(DATA_DIR, "teamleader");
  const pbDir = resolve(DATA_DIR, "projektron-bcs");

  beforeEach(async () => {
    await mkdir(tlDir, { recursive: true });
    await mkdir(pbDir, { recursive: true });
    await copyFile(TL_FIXTURE_XLSX, resolve(tlDir, "teamleader.xlsx"));
    await copyFile(PB_FIXTURE_XLSX, resolve(pbDir, "projektron.xlsx"));
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-timetracking-integration__"), {
      recursive: true,
      force: true,
    });
  });

  it("merges entries from teamleader and projektron-bcs sources", async () => {
    const client = await createTimeTrackingClient({
      dataFolderName: "__test-timetracking-integration__",
      ticketPrefix: "ACME",
      sources: [
        { rawFormat: "teamleader-excel", subFolder: "teamleader" },
        { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
      ],
    });

    const sheet = await client.getTimeSheet();
    // Both fixtures have 11 entries each (12 raw, 1 filtered)
    expect(sheet.entries).toHaveLength(22);
    expect(sheet.rawEntryCount).toBe(24);
    expect(sheet.sourceSystem).toBe("teamleader+projektron-bcs");
  });

  it("filters merged entries by ticket ID across sources", async () => {
    const client = await createTimeTrackingClient({
      dataFolderName: "__test-timetracking-integration__",
      ticketPrefix: "ACME",
      sources: [
        { rawFormat: "teamleader-excel", subFolder: "teamleader" },
        { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
      ],
    });

    const sheet = await client.getTimeSheet({
      ticketIds: ["ACME-200"],
    });
    // ACME-200 appears in both fixtures
    expect(sheet.entries.length).toBeGreaterThanOrEqual(2);
    for (const entry of sheet.entries) {
      expect(entry.detectedIds).toContain("ACME-200");
    }
  });
});
