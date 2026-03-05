/**
 * Tier 2 — adapter fixture test for calibration report server utilities.
 *
 * Tests listCalibrationReports and readCalibrationReport against committed
 * fixture files in __fixtures__/calibration/.
 *
 * Source provenance: see __fixtures__/calibration/README.md
 */

import { resolve } from "node:path";

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock dataDir() to point at the committed fixture directory.
// reports.ts uses: join(dataDir(), projectSlug, "calibration")
// With PROJECT_SLUG = "" this resolves to __fixtures__/calibration/.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dirname, "__fixtures__");

vi.mock("./paths.js", () => ({
  dataDir: () => FIXTURES_DIR,
}));

// Import AFTER mocking
const { listCalibrationReports, readCalibrationReport } = await import(
  "./reports.js"
);

// Fixture layout:
//   __fixtures__/calibration/report-2025-01_2026-01.json  (strong, R²=0.78, n=18)
//   __fixtures__/calibration/report-2024-06_2025-05.json  (moderate, R²=0.52, n=8)

/** Empty slug — join(FIXTURES_DIR, "", "calibration") resolves to __fixtures__/calibration/. */
const PROJECT_SLUG = "";

describe("calibration reports adapter — fixture test", () => {
  describe("listCalibrationReports", () => {
    it("discovers all report files from the fixture directory", async () => {
      const reports = await listCalibrationReports(PROJECT_SLUG);
      expect(reports).toHaveLength(2);
    });

    it("sorts reports by periodEnd descending (newest first)", async () => {
      const reports = await listCalibrationReports(PROJECT_SLUG);
      expect(reports[0].periodEnd).toBe("2026-01");
      expect(reports[1].periodEnd).toBe("2025-05");
    });

    it("extracts correct metadata from the strong-fit fixture", async () => {
      const reports = await listCalibrationReports(PROJECT_SLUG);
      const strong = reports.find((r) => r.slug === "report-2025-01_2026-01");

      expect(strong).toBeDefined();
      expect(strong!.periodStart).toBe("2025-01");
      expect(strong!.periodEnd).toBe("2026-01");
      expect(strong!.sampleSize).toBe(18);
      expect(strong!.fitAssessment).toBe("strong");
      expect(strong!.rSquared).toBeCloseTo(0.78);
      expect(strong!.filename).toBe("report-2025-01_2026-01.json");
      expect(strong!.createdAt).toBeTruthy();
    });

    it("extracts correct metadata from the moderate-fit fixture", async () => {
      const reports = await listCalibrationReports(PROJECT_SLUG);
      const moderate = reports.find((r) => r.slug === "report-2024-06_2025-05");

      expect(moderate).toBeDefined();
      expect(moderate!.periodStart).toBe("2024-06");
      expect(moderate!.periodEnd).toBe("2025-05");
      expect(moderate!.sampleSize).toBe(8);
      expect(moderate!.fitAssessment).toBe("moderate");
      expect(moderate!.rSquared).toBeCloseTo(0.52);
    });

    it("ignores non-matching files (README.md)", async () => {
      const reports = await listCalibrationReports(PROJECT_SLUG);
      const slugs = reports.map((r) => r.slug);
      expect(slugs).not.toContain("README");
    });

    it("returns empty array for non-existent project", async () => {
      const reports = await listCalibrationReports("does-not-exist");
      expect(reports).toEqual([]);
    });
  });

  describe("readCalibrationReport", () => {
    it("reads the strong-fit report by slug", async () => {
      const report = await readCalibrationReport(
        PROJECT_SLUG,
        "report-2025-01_2026-01",
      );

      expect(report).not.toBeNull();
      expect(report!.result.periodStart).toBe("2025-01");
      expect(report!.result.periodEnd).toBe("2026-01");
      expect(report!.result.sampleSize).toBe(18);
      expect(report!.result.rSquared).toBeCloseTo(0.78);
      expect(report!.result.formulaValidation.fitAssessment).toBe("strong");
      expect(report!.clusters).toHaveLength(1);
      expect(report!.residuals).toHaveLength(1);
    });

    it("reads the moderate-fit report by slug", async () => {
      const report = await readCalibrationReport(
        PROJECT_SLUG,
        "report-2024-06_2025-05",
      );

      expect(report).not.toBeNull();
      expect(report!.result.periodStart).toBe("2024-06");
      expect(report!.result.sampleSize).toBe(8);
      expect(report!.result.formulaValidation.fitAssessment).toBe("moderate");
    });

    it("returns null for a non-existent report slug", async () => {
      const report = await readCalibrationReport(
        PROJECT_SLUG,
        "report-9999-01_9999-12",
      );
      expect(report).toBeNull();
    });

    it("returns null for a non-existent project", async () => {
      const report = await readCalibrationReport(
        "does-not-exist",
        "report-2025-01_2026-01",
      );
      expect(report).toBeNull();
    });
  });
});
