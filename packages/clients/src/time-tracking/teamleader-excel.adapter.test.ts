import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { TeamleaderExcelAdapter } from "./teamleader-excel/adapter.js";

// ---------------------------------------------------------------------------
// Tier 2 — adapter fixture test
// TeamleaderExcelAdapter wired against the committed sanitized fixture.
// Source provenance: see teamleader-excel/__fixtures__/create-sample-timesheet.ts
// ---------------------------------------------------------------------------

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "teamleader-excel",
  "__fixtures__",
  "sample-timesheet.xlsx",
);

describe("TeamleaderExcelAdapter — adapter fixture", () => {
  const adapter = new TeamleaderExcelAdapter();

  it("parses the sample timesheet", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    expect(sheet.entries.length).toBeGreaterThan(0);
  });

  it("filters out entries below MIN_DURATION_HOURS (L1 cleaning)", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    // The fixture contains one entry with 0.05 hours — must be filtered out
    // 12 rows total, 1 filtered → 11 entries
    expect(sheet.entries).toHaveLength(11);
    for (const entry of sheet.entries) {
      expect(entry.durationHours).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("reports rawEntryCount including filtered entries", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    // 12 data rows in fixture
    expect(sheet.rawEntryCount).toBe(12);
  });

  it("detects ticket IDs from plain text", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    const entry = sheet.entries.find((e) =>
      e.rawComment.includes("ACME-100 Implement"),
    );
    expect(entry?.detectedIds).toContain("ACME-100");
    expect(entry?.attributionType).toBe("DIRECT");
  });

  it("detects ticket IDs from Jira URLs", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    const entry = sheet.entries.find((e) =>
      e.rawComment.includes("browse/ACME-101"),
    );
    expect(entry?.detectedIds).toContain("ACME-101");
    expect(entry?.attributionType).toBe("DIRECT");
  });

  it("classifies KBV entries (no ticket IDs)", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    const kbvEntries = sheet.entries.filter(
      (e) => e.attributionType === "KBV",
    );
    expect(kbvEntries).toHaveLength(3);
    for (const entry of kbvEntries) {
      expect(entry.detectedIds).toEqual([]);
    }
  });

  it("classifies MULTI_ID_SPLIT entries (2-3 IDs)", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    const multiEntry = sheet.entries.find(
      (e) => e.attributionType === "MULTI_ID_SPLIT",
    );
    expect(multiEntry).toBeDefined();
    expect(multiEntry!.detectedIds.length).toBeGreaterThanOrEqual(2);
    expect(multiEntry!.detectedIds.length).toBeLessThanOrEqual(3);
  });

  it("classifies UNLINKED_OVERHEAD entries (>3 IDs)", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    const overheadEntry = sheet.entries.find(
      (e) => e.attributionType === "UNLINKED_OVERHEAD",
    );
    expect(overheadEntry).toBeDefined();
    expect(overheadEntry!.detectedIds.length).toBeGreaterThan(3);
  });

  it("parses dates to ISO 8601", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    for (const entry of sheet.entries) {
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("computes correct period boundaries", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    // Fixture dates range from 10-03-2025 to 16-03-2025
    expect(sheet.periodStart).toMatch(/^2025-03-10/);
    expect(sheet.periodEnd).toMatch(/^2025-03-16/);
  });

  it("sets sourceSystem to teamleader", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    expect(sheet.sourceSystem).toBe("teamleader");
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — adapter fixture test (v2 "Export" format)
// Columns: Datum, Dauer (minutes), Ticket-ID, Beschreibung, etc.
// Source provenance: see teamleader-excel/__fixtures__/create-sample-timesheet-v2.ts
// ---------------------------------------------------------------------------

const FIXTURE_V2_PATH = resolve(
  import.meta.dirname,
  "teamleader-excel",
  "__fixtures__",
  "sample-timesheet-v2.xlsx",
);

describe("TeamleaderExcelAdapter — v2 export format", () => {
  const adapter = new TeamleaderExcelAdapter();

  it("parses the v2 sample timesheet", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    expect(sheet.entries.length).toBeGreaterThan(0);
  });

  it("converts duration from minutes to hours", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    // First entry: 150 min = 2.5 hours
    const entry = sheet.entries.find((e) =>
      e.rawComment.includes("ACME-100 Implement"),
    );
    expect(entry?.durationHours).toBe(2.5);
  });

  it("filters out entries below MIN_DURATION_HOURS after conversion (L1 cleaning)", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    // 13 rows total, 1 filtered (3 min = 0.05h < 0.1h) → 12 entries
    expect(sheet.entries).toHaveLength(12);
    for (const entry of sheet.entries) {
      expect(entry.durationHours).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("reports rawEntryCount including filtered entries", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    expect(sheet.rawEntryCount).toBe(13);
  });

  it("parses ISO 8601 timestamps from Datum column", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    for (const entry of sheet.entries) {
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("detects ticket IDs from description text", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    const entry = sheet.entries.find((e) =>
      e.rawComment.includes("ACME-100 Implement"),
    );
    expect(entry?.detectedIds).toContain("ACME-100");
    expect(entry?.attributionType).toBe("DIRECT");
  });

  it("picks up ticket IDs from the Ticket-ID column", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    // Entry 13 has "ACME-400" in the Ticket-ID column, description has no
    // Jira-style ID.
    const entry = sheet.entries.find((e) =>
      e.rawComment.includes("Payment flow debugging"),
    );
    expect(entry?.detectedIds).toContain("ACME-400");
    expect(entry?.attributionType).toBe("DIRECT");
  });

  it("computes correct period boundaries", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    expect(sheet.periodStart).toMatch(/^2025-03-10/);
    expect(sheet.periodEnd).toMatch(/^2025-03-16/);
  });

  it("sets sourceSystem to teamleader", async () => {
    const sheet = await adapter.parse(FIXTURE_V2_PATH);
    expect(sheet.sourceSystem).toBe("teamleader");
  });
});
