import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjektronBcsExcelAdapter } from "./projektron-bcs-excel/adapter.js";

// ---------------------------------------------------------------------------
// Tier 2 — adapter fixture test
// ProjektronBcsExcelAdapter wired against the committed sanitized fixture.
// Source provenance: see projektron-bcs-excel/__fixtures__/create-sample-timesheet.ts
// ---------------------------------------------------------------------------

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "projektron-bcs-excel",
  "__fixtures__",
  "sample-timesheet.xlsx",
);

describe("ProjektronBcsExcelAdapter — adapter fixture", () => {
  const adapter = new ProjektronBcsExcelAdapter();

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
      e.rawComment.includes("ACME-100"),
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
    expect(kbvEntries).toHaveLength(4);
    for (const entry of kbvEntries) {
      expect(entry.detectedIds).toEqual([]);
    }
  });

  it("classifies MULTI_ID_SPLIT entries (2-3 IDs)", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    const multiEntries = sheet.entries.filter(
      (e) => e.attributionType === "MULTI_ID_SPLIT",
    );
    expect(multiEntries).toHaveLength(2);
    for (const entry of multiEntries) {
      expect(entry.detectedIds.length).toBeGreaterThanOrEqual(2);
      expect(entry.detectedIds.length).toBeLessThanOrEqual(3);
    }
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
    // Fixture dates range from 2025-03-03 to 2025-03-14
    expect(sheet.periodStart).toMatch(/^2025-03-03/);
    expect(sheet.periodEnd).toMatch(/^2025-03-14/);
  });

  it("sets sourceSystem to projektron-bcs", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    expect(sheet.sourceSystem).toBe("projektron-bcs");
  });

  it("handles comment-less data rows (PR review without ticket)", async () => {
    const sheet = await adapter.parse(FIXTURE_PATH);
    // Entry 12 has "PR review" as a comment row, classified as KBV (no ticket IDs)
    const prReview = sheet.entries.find((e) =>
      e.rawComment.includes("PR review"),
    );
    expect(prReview).toBeDefined();
    expect(prReview!.attributionType).toBe("KBV");
  });
});
