/**
 * Unit tests for executive-summary.ts — prompt construction and LLM integration.
 */

import { describe, it, expect, vi } from "vitest";

import type { CalibrationRunOutput } from "@isv/domain";
import type { LlmClient } from "@isv/clients";

import {
  buildSummaryPrompt,
  generateExecutiveSummary,
} from "./executive-summary.js";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

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
      {
        feature: "B1_Logic",
        partialCorrelation: 0.3,
        weight: 0.8,
        pValue: 0.12,
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
    outliers: {
      outlierCount: 1,
      outlierPercentage: 0.1,
      entries: [
        {
          clusterId: "PROJ-99",
          residual: 12.5,
          standardizedResidual: 2.8,
          reason: "EXTREME_HOURS",
        },
      ],
    },
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
      factorRanking: [
        {
          feature: "A1_Data",
          absPartialCorrelation: 0.5,
          isSignificant: true,
        },
        {
          feature: "B1_Logic",
          absPartialCorrelation: 0.3,
          isSignificant: false,
        },
      ],
      mismatches: {
        multiplicativeFactorsWithLowWeight: [],
        additiveFactorsWithDominantWeight: [],
        gitMetricsOutperformingIsv: false,
      },
      recommendations: ["Increase sample size for narrower confidence interval."],
    },
  },
  clusters: [],
  residuals: [],
  skippedClusters: [{ clusterId: "PROJ-50", reason: "Low confidence" }],
};

// ---------------------------------------------------------------------------
// buildSummaryPrompt
// ---------------------------------------------------------------------------

describe("buildSummaryPrompt", () => {
  it("includes period start and end", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("Start: 2025-01");
    expect(prompt).toContain("End: 2026-01");
  });

  it("includes sample and skip counts", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("Total clusters analysed: 10");
    expect(prompt).toContain("Skipped clusters: 1");
  });

  it("calculates euro per ISV using daily rate", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    // 4.0 h/ISV × (1000/8) = 500 €/ISV
    expect(prompt).toContain("500.00 €/ISV");
  });

  it("includes R² and fit assessment", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("R²: 0.8500");
    expect(prompt).toContain("Fit Assessment: strong");
  });

  it("includes DQS percentage", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("Data Quality Score (DQS): 95.0%");
  });

  it("lists significant factors", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("A1_Data");
    // B1_Logic has p=0.12, should not be in significant list
    expect(prompt).not.toMatch(
      /Statistically significant.*B1_Logic/,
    );
  });

  it("includes outlier info", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("Outliers detected: 1 (10.0% of sample)");
  });

  it("includes confidence interval", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("95% Confidence Interval: 3.00 – 5.00 h/ISV");
  });

  it("includes recommendations", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).toContain("Increase sample size");
  });

  it("omits cohort section when no cohort data is present", () => {
    const prompt = buildSummaryPrompt(minimalOutput, 1000);
    expect(prompt).not.toContain("Data Cohort Analysis");
  });

  it("includes cohort section when cohort data is present", () => {
    const outputWithCohorts: CalibrationRunOutput = {
      ...minimalOutput,
      cohortOverview: [
        { cohort: "A", label: "High confidence", clusterCount: 30, clusterPct: 42.9, totalHours: 500, hoursPct: 60 },
        { cohort: "B", label: "Medium confidence", clusterCount: 10, clusterPct: 14.3, totalHours: 150, hoursPct: 18 },
        { cohort: "C", label: "Low confidence", clusterCount: 30, clusterPct: 42.9, totalHours: 183, hoursPct: 22 },
      ],
      cohortCalibrations: [
        {
          key: "A",
          includedCohorts: ["A"],
          sampleSize: 30,
          calibration: { ...minimalOutput.result, rSquared: 0.65 },
          residuals: [],
        },
        {
          key: "A+B+C",
          includedCohorts: ["A", "B", "C"],
          sampleSize: 70,
          calibration: minimalOutput.result,
          residuals: [],
        },
      ],
      primaryCohortKey: "A",
    };

    const prompt = buildSummaryPrompt(outputWithCohorts, 1000);
    expect(prompt).toContain("Data Cohort Analysis");
    expect(prompt).toContain('primary calibration tier is "A"');
    expect(prompt).toContain("Cohort A (High confidence): 30 clusters");
    expect(prompt).toContain("Tier A: 30 clusters, R²=0.6500");
    expect(prompt).toContain("Tier A+B+C: 70 clusters");
  });
});

// ---------------------------------------------------------------------------
// generateExecutiveSummary
// ---------------------------------------------------------------------------

describe("generateExecutiveSummary", () => {
  it("returns LLM text on success", async () => {
    const mockLlm: LlmClient = {
      prompt: vi.fn().mockResolvedValue({
        success: true,
        data: "This is the executive summary.",
      }),
    };

    const summary = await generateExecutiveSummary(minimalOutput, mockLlm, 1000);
    expect(summary).toBe("This is the executive summary.");
    expect(mockLlm.prompt).toHaveBeenCalledOnce();
  });

  it("returns undefined on LLM failure", async () => {
    const mockLlm: LlmClient = {
      prompt: vi.fn().mockResolvedValue({
        success: false,
        error: { code: "LLM_PROMPT_FAILED", message: "timeout", source: "llm" },
      }),
    };

    const summary = await generateExecutiveSummary(minimalOutput, mockLlm, 1000);
    expect(summary).toBeUndefined();
  });

  it("returns undefined when LLM returns empty text", async () => {
    const mockLlm: LlmClient = {
      prompt: vi.fn().mockResolvedValue({
        success: true,
        data: "   ",
      }),
    };

    const summary = await generateExecutiveSummary(minimalOutput, mockLlm, 1000);
    expect(summary).toBeUndefined();
  });

  it("passes temperature 0.4 and maxTokens 2000", async () => {
    const mockLlm: LlmClient = {
      prompt: vi.fn().mockResolvedValue({
        success: true,
        data: "Summary text.",
      }),
    };

    await generateExecutiveSummary(minimalOutput, mockLlm, 1000);
    const call = vi.mocked(mockLlm.prompt).mock.calls[0][0];
    expect(call.temperature).toBe(0.4);
    expect(call.maxTokens).toBe(2000);
  });
});
