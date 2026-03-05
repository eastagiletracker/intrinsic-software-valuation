import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createTimeTrackingClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Real-world tests — use gitignored data from data/unicef/
//
// These tests are skipped automatically when the data files are not present
// (e.g. in CI). Run locally with:  pnpm test:realworld
//
// File naming: *.realworld.test.ts — excluded from default `pnpm test` via
// vitest config and runnable via dedicated `pnpm test:realworld` script.
// ---------------------------------------------------------------------------

const XLSX_PATH = resolve(
  "data",
  "unicef",
  "time-tracking",
  "teamleader",
  "Arbeitszeiten_Unicef_2025.xlsx",
);
const DATA_AVAILABLE = existsSync(XLSX_PATH);

const PB_DIR = resolve("data", "unicef", "time-tracking", "projektron-bcs");
const PB_DATA_AVAILABLE = existsSync(PB_DIR);

/** Shared client config for teamleader-only realworld tests. */
const TL_CONFIG = {
  dataFolderName: "unicef",
  ticketPrefix: "UNICEF",
  sources: [{ rawFormat: "teamleader-excel" as const, subFolder: "teamleader" }],
};

describe.skipIf(!DATA_AVAILABLE)(
  "TimeTrackingClient — realworld (unicef)",
  () => {
    it("parses the real Teamleader Excel export", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      const sheet = await client.getTimeSheet();

      expect(sheet.entries.length).toBeGreaterThan(0);
      expect(sheet.sourceSystem).toBe("teamleader");
    });

    it("all entries have positive duration", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      const sheet = await client.getTimeSheet();

      for (const entry of sheet.entries) {
        expect(entry.durationHours).toBeGreaterThan(0);
      }
    });

    it("all entries have valid ISO timestamps", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      const sheet = await client.getTimeSheet();

      for (const entry of sheet.entries) {
        expect(entry.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );
      }
    });

    it("all entries have a valid attribution type", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      const sheet = await client.getTimeSheet();

      const validTypes = [
        "DIRECT",
        "KBV",
        "MULTI_ID_SPLIT",
        "UNLINKED_OVERHEAD",
      ];
      for (const entry of sheet.entries) {
        expect(validTypes).toContain(entry.attributionType);
      }
    });

    it("DIRECT entries have exactly one detected ID", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      const sheet = await client.getTimeSheet();
      const directEntries = sheet.entries.filter(
        (e) => e.attributionType === "DIRECT",
      );

      for (const entry of directEntries) {
        expect(entry.detectedIds).toHaveLength(1);
      }
    });

    it("KBV entries have no detected IDs", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      const sheet = await client.getTimeSheet();
      const kbvEntries = sheet.entries.filter(
        (e) => e.attributionType === "KBV",
      );

      for (const entry of kbvEntries) {
        expect(entry.detectedIds).toEqual([]);
      }
    });

    it("ticket ID filter works with real data", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      // First get all entries and pick a known ticket ID
      const allSheet = await client.getTimeSheet();
      const directEntry = allSheet.entries.find(
        (e) =>
          e.attributionType === "DIRECT" &&
          e.detectedIds[0]?.startsWith("UNICEF-"),
      );

      if (directEntry) {
        const filteredSheet = await client.getTimeSheet({
          ticketIds: [directEntry.detectedIds[0]],
        });

        expect(filteredSheet.entries.length).toBeGreaterThanOrEqual(1);
        for (const entry of filteredSheet.entries) {
          expect(entry.detectedIds).toContain(directEntry.detectedIds[0]);
        }
      }
    });

    it("period boundaries are plausible", async () => {
      const client = await createTimeTrackingClient(TL_CONFIG);

      const sheet = await client.getTimeSheet();

      const start = new Date(sheet.periodStart);
      const end = new Date(sheet.periodEnd);
      // Period should be within a reasonable range (2024-2026)
      expect(start.getFullYear()).toBeGreaterThanOrEqual(2024);
      expect(end.getFullYear()).toBeLessThanOrEqual(2026);
      expect(end.getTime()).toBeGreaterThanOrEqual(start.getTime());
    });
  },
);

// ---------------------------------------------------------------------------
// Projektron BCS Excel — real-world tests
// ---------------------------------------------------------------------------

describe.skipIf(!PB_DATA_AVAILABLE)(
  "TimeTrackingClient — realworld projektron-bcs (unicef)",
  () => {
    it("parses all Projektron BCS Excel exports", async () => {
      const client = await createTimeTrackingClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        sources: [
          { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
        ],
      });

      const sheet = await client.getTimeSheet();
      expect(sheet.entries.length).toBeGreaterThan(0);
      expect(sheet.sourceSystem).toBe("projektron-bcs");
    });

    it("all entries have positive duration", async () => {
      const client = await createTimeTrackingClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        sources: [
          { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
        ],
      });

      const sheet = await client.getTimeSheet();
      for (const entry of sheet.entries) {
        expect(entry.durationHours).toBeGreaterThan(0);
      }
    });

    it("all entries have valid ISO timestamps", async () => {
      const client = await createTimeTrackingClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        sources: [
          { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
        ],
      });

      const sheet = await client.getTimeSheet();
      for (const entry of sheet.entries) {
        expect(entry.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );
      }
    });

    it("all entries have a valid attribution type", async () => {
      const client = await createTimeTrackingClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        sources: [
          { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
        ],
      });

      const sheet = await client.getTimeSheet();
      const validTypes = [
        "DIRECT",
        "KBV",
        "MULTI_ID_SPLIT",
        "UNLINKED_OVERHEAD",
      ];
      for (const entry of sheet.entries) {
        expect(validTypes).toContain(entry.attributionType);
      }
    });

    it("period boundaries are plausible", async () => {
      const client = await createTimeTrackingClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        sources: [
          { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
        ],
      });

      const sheet = await client.getTimeSheet();
      const start = new Date(sheet.periodStart);
      const end = new Date(sheet.periodEnd);
      expect(start.getFullYear()).toBeGreaterThanOrEqual(2023);
      expect(end.getFullYear()).toBeLessThanOrEqual(2026);
      expect(end.getTime()).toBeGreaterThanOrEqual(start.getTime());
    });
  },
);

// ---------------------------------------------------------------------------
// Combined multi-source — real-world test
// ---------------------------------------------------------------------------

const BOTH_AVAILABLE = DATA_AVAILABLE && PB_DATA_AVAILABLE;

describe.skipIf(!BOTH_AVAILABLE)(
  "TimeTrackingClient — realworld multi-source (unicef)",
  () => {
    it("merges teamleader and projektron-bcs in a single client", async () => {
      const client = await createTimeTrackingClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        sources: [
          { rawFormat: "teamleader-excel", subFolder: "teamleader" },
          { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
        ],
      });

      const sheet = await client.getTimeSheet();
      expect(sheet.entries.length).toBeGreaterThan(0);
      expect(sheet.sourceSystem).toBe("teamleader+projektron-bcs");
    });
  },
);
