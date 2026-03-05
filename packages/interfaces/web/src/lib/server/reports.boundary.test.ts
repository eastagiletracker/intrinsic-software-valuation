/**
 * Boundary test for calibration report listing and report reading.
 *
 * Validates AC-9: multiple reports for the same project are listed and routable.
 *
 * Uses a temporary directory to simulate the data/<projectSlug>/calibration/ structure.
 * Tests the server-side utility functions that back the SvelteKit routes.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Fixture: minimal CalibrationRunOutput as it would be persisted by the CLI
// ---------------------------------------------------------------------------

function makeReport(overrides: {
  periodStart: string;
  periodEnd: string;
  sampleSize?: number;
  rSquared?: number;
  fitAssessment?: "strong" | "moderate" | "weak";
}) {
  return {
    result: {
      formulaVersion: "3.4",
      shipRateHoursPerIsv: 4.0,
      shipRateExclOutliers: 3.8,
      rSquared: overrides.rSquared ?? 0.85,
      adjustedRSquared: 0.82,
      dataQualityScore: 0.95,
      sampleSize: overrides.sampleSize ?? 10,
      periodStart: overrides.periodStart,
      periodEnd: overrides.periodEnd,
      factorDiagnostics: [
        {
          feature: "A1_Data",
          partialCorrelation: 0.5,
          weight: 1.2,
          pValue: 0.03,
        },
      ],
      reliability: {
        sampleSize: overrides.sampleSize ?? 10,
        effectiveSampleSize: (overrides.sampleSize ?? 10) - 1,
        standardError: 0.5,
        confidenceInterval95: { lower: 3.0, upper: 5.0 },
        coefficientOfVariation: 0.125,
        dataQualityScore: 0.95,
        normalityFlag: "pass",
      },
      outliers: { outlierCount: 0, outlierPercentage: 0, entries: [] },
      normalityAssessment: {
        testName: "shapiro-wilk",
        testStatistic: 0.95,
        pValue: 0.6,
        skewness: 0.1,
        kurtosis: -0.2,
        flag: "pass",
      },
      formulaValidation: {
        fitAssessment: overrides.fitAssessment ?? "strong",
        shipRateReliability: "Ship Rate is reliable",
        dataQualityAssessment: "Data quality is good",
        factorRanking: [
          {
            feature: "A1_Data",
            absPartialCorrelation: 0.5,
            isSignificant: true,
          },
        ],
        mismatches: {
          multiplicativeFactorsWithLowWeight: [],
          additiveFactorsWithDominantWeight: [],
          gitMetricsOutperformingIsv: false,
        },
        recommendations: ["Consider more data points"],
      },
    },
    clusters: [
      {
        clusterId: "PROJ-1",
        ids: ["PROJ-1"],
        metadata: {
          type: "Story",
          timestampT0: "2025-01-15T00:00:00.000Z",
        },
        isvAnalysis: {
          formulaVersion: "3.4",
          isvScore: 4,
          confidence: 0.85,
          factors: {
            A1_Data: 1,
            A2_UX: 2,
            B1_Logic: 2,
            C1_Integration: 1,
            C2_State: 1,
            D3_Quality: 1,
          },
          breakdown: { poValue: 4, archFactor: 1, qualityMultiplier: 1 },
        },
        metrics: {
          totalHours: 16,
          gitChanges: {
            locAdded: 100,
            locDeleted: 20,
            filesChanged: 5,
            distributionEntropy: 0.5,
            cyclomaticComplexityDelta: 2,
            changeIntensityScore: 0.3,
          },
        },
      },
    ],
    residuals: [
      {
        clusterId: "PROJ-1",
        actualHours: 16,
        predictedHours: 14,
        residual: 2,
        standardizedResidual: 0.4,
        isOutlier: false,
      },
    ],
    skippedClusters: [],
  };
}

// ---------------------------------------------------------------------------
// Test setup: temp directory simulating monorepo data/ structure
// ---------------------------------------------------------------------------

const testRoot = join(tmpdir(), `isv-report-test-${Date.now()}`);
const projectSlug = "test-project";
const calibrationDir = join(testRoot, "data", projectSlug, "calibration");

beforeAll(async () => {
  await mkdir(calibrationDir, { recursive: true });

  // Write two report files with different timeframes
  await writeFile(
    join(calibrationDir, "report-2024-07_2025-06.json"),
    JSON.stringify(
      makeReport({
        periodStart: "2024-07",
        periodEnd: "2025-06",
        sampleSize: 15,
        rSquared: 0.72,
        fitAssessment: "strong",
      }),
    ),
  );
  await writeFile(
    join(calibrationDir, "report-2025-01_2026-01.json"),
    JSON.stringify(
      makeReport({
        periodStart: "2025-01",
        periodEnd: "2026-01",
        sampleSize: 22,
        rSquared: 0.55,
        fitAssessment: "moderate",
      }),
    ),
  );

  // Write a non-report file that should be ignored
  await writeFile(
    join(calibrationDir, "not-a-report.json"),
    JSON.stringify({ irrelevant: true }),
  );
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Stub process.cwd so that the server utility resolves the temp root
// ---------------------------------------------------------------------------

// The reports.ts module uses: join(process.cwd(), "..", "..", "..", "data")
// We need to make this resolve to testRoot/data/.
// If process.cwd() returns testRoot/a/b/c, then join("a/b/c", "..", "..", "..", "data") = testRoot/data/.
const fakeCwd = join(testRoot, "a", "b", "c");

vi.stubGlobal("process", {
  ...process,
  cwd: () => fakeCwd,
});

// Import AFTER stubbing process.cwd
const { listCalibrationReports, readCalibrationReport } = await import(
  "./reports.js"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calibration report server utilities", () => {
  describe("listCalibrationReports", () => {
    it("lists multiple reports for the same project sorted by periodEnd descending", async () => {
      const reports = await listCalibrationReports(projectSlug);

      expect(reports).toHaveLength(2);
      // Newest first
      expect(reports[0].periodEnd).toBe("2026-01");
      expect(reports[1].periodEnd).toBe("2025-06");
    });

    it("extracts correct metadata from each report", async () => {
      const reports = await listCalibrationReports(projectSlug);

      const newer = reports.find((r) => r.slug === "report-2025-01_2026-01");
      expect(newer).toBeDefined();
      expect(newer!.periodStart).toBe("2025-01");
      expect(newer!.periodEnd).toBe("2026-01");
      expect(newer!.sampleSize).toBe(22);
      expect(newer!.fitAssessment).toBe("moderate");
      expect(newer!.rSquared).toBeCloseTo(0.55);
      expect(newer!.createdAt).toBeTruthy();
      expect(newer!.filename).toBe("report-2025-01_2026-01.json");

      const older = reports.find((r) => r.slug === "report-2024-07_2025-06");
      expect(older).toBeDefined();
      expect(older!.sampleSize).toBe(15);
      expect(older!.fitAssessment).toBe("strong");
    });

    it("ignores non-report files", async () => {
      const reports = await listCalibrationReports(projectSlug);
      const slugs = reports.map((r) => r.slug);
      expect(slugs).not.toContain("not-a-report");
    });

    it("returns empty array for non-existent project", async () => {
      const reports = await listCalibrationReports("non-existent");
      expect(reports).toEqual([]);
    });
  });

  describe("readCalibrationReport", () => {
    it("reads a specific report by slug", async () => {
      const report = await readCalibrationReport(
        projectSlug,
        "report-2025-01_2026-01",
      );

      expect(report).not.toBeNull();
      expect(report!.result.periodStart).toBe("2025-01");
      expect(report!.result.periodEnd).toBe("2026-01");
      expect(report!.result.sampleSize).toBe(22);
      expect(report!.clusters).toHaveLength(1);
      expect(report!.residuals).toHaveLength(1);
    });

    it("reads a different report by slug", async () => {
      const report = await readCalibrationReport(
        projectSlug,
        "report-2024-07_2025-06",
      );

      expect(report).not.toBeNull();
      expect(report!.result.periodStart).toBe("2024-07");
      expect(report!.result.sampleSize).toBe(15);
    });

    it("returns null for non-existent report", async () => {
      const report = await readCalibrationReport(
        projectSlug,
        "report-9999-01_9999-12",
      );
      expect(report).toBeNull();
    });

    it("returns null for non-existent project", async () => {
      const report = await readCalibrationReport(
        "non-existent",
        "report-2025-01_2026-01",
      );
      expect(report).toBeNull();
    });
  });
});
