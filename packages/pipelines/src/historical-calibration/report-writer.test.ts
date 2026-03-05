/**
 * Unit test for report-writer.ts — report filename generation and file persistence.
 */

import { describe, it, expect, afterAll } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { CalibrationRunOutput } from "@isv/domain";

import {
  reportFilename,
  writeCalibrationReport,
} from "./report-writer.js";

// ---------------------------------------------------------------------------
// reportFilename
// ---------------------------------------------------------------------------

describe("reportFilename", () => {
  it("builds canonical filename from period start and end", () => {
    expect(reportFilename("2025-01", "2026-01")).toBe(
      "report-2025-01_2026-01.json",
    );
  });

  it("handles single-digit months", () => {
    expect(reportFilename("2024-07", "2025-06")).toBe(
      "report-2024-07_2025-06.json",
    );
  });
});

// ---------------------------------------------------------------------------
// writeCalibrationReport
// ---------------------------------------------------------------------------

const testRoot = join(tmpdir(), `isv-report-writer-test-${Date.now()}`);
const projectSlug = "writer-test-project";

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

/** Minimal valid CalibrationRunOutput for persistence testing. */
const minimalOutput: CalibrationRunOutput = {
  result: {
    formulaVersion: "3.4",
    shipRateHoursPerIsv: 4.0,
    shipRateExclOutliers: 3.8,
    rSquared: 0.85,
    adjustedRSquared: 0.82,
    dataQualityScore: 0.95,
    sampleSize: 10,
    periodStart: "2025-01",
    periodEnd: "2026-01",
    factorDiagnostics: [
      {
        feature: "A1_Data",
        partialCorrelation: 0.5,
        weight: 1.2,
        pValue: 0.03,
      },
    ],
    reliability: {
      sampleSize: 10,
      effectiveSampleSize: 9,
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
      fitAssessment: "strong",
      shipRateReliability: "Ship Rate is reliable",
      dataQualityAssessment: "Data quality is good",
      factorRanking: [],
      mismatches: {
        multiplicativeFactorsWithLowWeight: [],
        additiveFactorsWithDominantWeight: [],
        gitMetricsOutperformingIsv: false,
      },
      recommendations: [],
    },
  },
  clusters: [],
  residuals: [],
  skippedClusters: [],
};

describe("writeCalibrationReport", () => {
  it("writes report file to the correct path", async () => {
    const filePath = await writeCalibrationReport(
      minimalOutput,
      projectSlug,
      testRoot,
    );

    expect(filePath).toBe(
      join(
        testRoot,
        "data",
        projectSlug,
        "calibration",
        "report-2025-01_2026-01.json",
      ),
    );

    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CalibrationRunOutput;
    expect(parsed.result.periodStart).toBe("2025-01");
    expect(parsed.result.periodEnd).toBe("2026-01");
  });

  it("creates the calibration directory if it does not exist", async () => {
    const newRoot = join(
      tmpdir(),
      `isv-report-writer-new-${Date.now()}`,
    );
    try {
      const filePath = await writeCalibrationReport(
        minimalOutput,
        "new-project",
        newRoot,
      );
      const raw = await readFile(filePath, "utf-8");
      expect(JSON.parse(raw).result.sampleSize).toBe(10);
    } finally {
      await rm(newRoot, { recursive: true, force: true });
    }
  });
});
