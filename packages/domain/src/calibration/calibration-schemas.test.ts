import { describe, it, expect } from "vitest";

import {
  CalibrationResultSchema,
  CalibrationRunOutputSchema,
  ClusterResidualSchema,
  NormalityAssessmentSchema,
  OutlierReportSchema,
  ReliabilitySummarySchema,
  FormulaValidationSchema,
  RegressionFeatureDiagnosticSchema,
} from "./index.js";

// ---------------------------------------------------------------------------
// Shared valid data fragments
// ---------------------------------------------------------------------------

const validDiagnostic = {
  feature: "A1_Data" as const,
  partialCorrelation: 0.5,
  weight: 1.2,
  pValue: 0.03,
};

const validAllDiagnostics = [
  { feature: "A1_Data", partialCorrelation: 0.5, weight: 1.2, pValue: 0.03 },
  { feature: "A2_UX", partialCorrelation: 0.3, weight: 0.8, pValue: 0.1 },
  { feature: "B1_Logic", partialCorrelation: 0.4, weight: 1.0, pValue: 0.05 },
  {
    feature: "C1_Integration",
    partialCorrelation: 0.2,
    weight: 0.5,
    pValue: 0.2,
  },
  { feature: "C2_State", partialCorrelation: 0.1, weight: 0.3, pValue: 0.5 },
  {
    feature: "D3_Quality",
    partialCorrelation: 0.15,
    weight: 0.4,
    pValue: 0.3,
  },
  {
    feature: "distributionEntropy",
    partialCorrelation: 0.35,
    weight: 0.9,
    pValue: 0.07,
  },
  {
    feature: "cyclomaticComplexityDelta",
    partialCorrelation: 0.25,
    weight: 0.6,
    pValue: 0.15,
  },
  {
    feature: "changeIntensityScore",
    partialCorrelation: 0.2,
    weight: 0.5,
    pValue: 0.2,
  },
];

const validReliability = {
  sampleSize: 10,
  effectiveSampleSize: 9,
  standardError: 0.5,
  confidenceInterval95: { lower: 3.0, upper: 5.0 },
  coefficientOfVariation: 0.125,
  dataQualityScore: 0.95,
  normalityFlag: "pass" as const,
};

const validOutliers = {
  outlierCount: 1,
  outlierPercentage: 0.1,
  entries: [
    {
      clusterId: "PROJ-99",
      residual: 50.0,
      standardizedResidual: 2.5,
      reason: "EXTREME_HOURS",
    },
  ],
};

const validNormality = {
  testName: "shapiro-wilk" as const,
  testStatistic: 0.95,
  pValue: 0.6,
  skewness: 0.1,
  kurtosis: -0.2,
  flag: "pass" as const,
};

const validFormulaValidation = {
  fitAssessment: "strong" as const,
  shipRateReliability: "Ship Rate is reliable",
  dataQualityAssessment: "Data quality is good",
  factorRanking: [
    { feature: "A1_Data", absPartialCorrelation: 0.5, isSignificant: true },
  ],
  mismatches: {
    multiplicativeFactorsWithLowWeight: [],
    additiveFactorsWithDominantWeight: [],
    gitMetricsOutperformingIsv: false,
  },
  recommendations: [],
};

const validCalibrationResult = {
  formulaVersion: "3.4",
  shipRateHoursPerIsv: 4.0,
  shipRateExclOutliers: 3.8,
  rSquared: 0.85,
  adjustedRSquared: 0.82,
  dataQualityScore: 0.95,
  sampleSize: 10,
  periodStart: "2025-01-01T00:00:00.000Z",
  periodEnd: "2025-06-01T00:00:00.000Z",
  factorDiagnostics: validAllDiagnostics,
  reliability: validReliability,
  outliers: validOutliers,
  normalityAssessment: validNormality,
  formulaValidation: validFormulaValidation,
};

// ---------------------------------------------------------------------------
// RegressionFeatureDiagnosticSchema
// ---------------------------------------------------------------------------

describe("RegressionFeatureDiagnosticSchema", () => {
  it("accepts valid ISV factor diagnostic", () => {
    const result = RegressionFeatureDiagnosticSchema.safeParse(validDiagnostic);
    expect(result.success).toBe(true);
  });

  it("accepts valid Git metric diagnostic", () => {
    const result = RegressionFeatureDiagnosticSchema.safeParse({
      feature: "distributionEntropy",
      partialCorrelation: 0.7,
      weight: 2.0,
      pValue: 0.001,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown feature name", () => {
    const result = RegressionFeatureDiagnosticSchema.safeParse({
      ...validDiagnostic,
      feature: "UNKNOWN",
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range partial correlation", () => {
    const result = RegressionFeatureDiagnosticSchema.safeParse({
      ...validDiagnostic,
      partialCorrelation: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ClusterResidualSchema
// ---------------------------------------------------------------------------

describe("ClusterResidualSchema", () => {
  it("accepts valid cluster residual", () => {
    const result = ClusterResidualSchema.safeParse({
      clusterId: "PROJ-1",
      actualHours: 40,
      predictedHours: 35,
      residual: 5,
      standardizedResidual: 0.8,
      isOutlier: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative actual hours", () => {
    const result = ClusterResidualSchema.safeParse({
      clusterId: "PROJ-1",
      actualHours: -5,
      predictedHours: 35,
      residual: -40,
      standardizedResidual: -3.0,
      isOutlier: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NormalityAssessmentSchema
// ---------------------------------------------------------------------------

describe("NormalityAssessmentSchema", () => {
  it("accepts valid Shapiro-Wilk result", () => {
    const result = NormalityAssessmentSchema.safeParse(validNormality);
    expect(result.success).toBe(true);
  });

  it("accepts valid Kolmogorov-Smirnov result", () => {
    const result = NormalityAssessmentSchema.safeParse({
      ...validNormality,
      testName: "kolmogorov-smirnov",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid flag", () => {
    const result = NormalityAssessmentSchema.safeParse({
      ...validNormality,
      flag: "unknown",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OutlierReportSchema
// ---------------------------------------------------------------------------

describe("OutlierReportSchema", () => {
  it("accepts valid outlier report", () => {
    const result = OutlierReportSchema.safeParse(validOutliers);
    expect(result.success).toBe(true);
  });

  it("accepts empty outlier report", () => {
    const result = OutlierReportSchema.safeParse({
      outlierCount: 0,
      outlierPercentage: 0,
      entries: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative outlier count", () => {
    const result = OutlierReportSchema.safeParse({
      ...validOutliers,
      outlierCount: -1,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ReliabilitySummarySchema
// ---------------------------------------------------------------------------

describe("ReliabilitySummarySchema", () => {
  it("accepts valid reliability summary", () => {
    const result = ReliabilitySummarySchema.safeParse(validReliability);
    expect(result.success).toBe(true);
  });

  it("rejects negative standard error", () => {
    const result = ReliabilitySummarySchema.safeParse({
      ...validReliability,
      standardError: -0.5,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FormulaValidationSchema
// ---------------------------------------------------------------------------

describe("FormulaValidationSchema", () => {
  it("accepts valid formula validation", () => {
    const result = FormulaValidationSchema.safeParse(validFormulaValidation);
    expect(result.success).toBe(true);
  });

  it("rejects invalid fit assessment", () => {
    const result = FormulaValidationSchema.safeParse({
      ...validFormulaValidation,
      fitAssessment: "excellent",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CalibrationResultSchema
// ---------------------------------------------------------------------------

describe("CalibrationResultSchema — extended", () => {
  it("accepts fully populated calibration result", () => {
    const result = CalibrationResultSchema.safeParse(validCalibrationResult);
    expect(result.success).toBe(true);
  });

  it("rejects result missing mandatory factorDiagnostics", () => {
    const { factorDiagnostics: _, ...withoutDiagnostics } =
      validCalibrationResult;
    const result = CalibrationResultSchema.safeParse(withoutDiagnostics);
    expect(result.success).toBe(false);
  });

  it("rejects result missing mandatory reliability", () => {
    const { reliability: _, ...without } = validCalibrationResult;
    const result = CalibrationResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects result missing mandatory outliers", () => {
    const { outliers: _, ...without } = validCalibrationResult;
    const result = CalibrationResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects result missing mandatory normalityAssessment", () => {
    const { normalityAssessment: _, ...without } = validCalibrationResult;
    const result = CalibrationResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects result missing mandatory formulaValidation", () => {
    const { formulaValidation: _, ...without } = validCalibrationResult;
    const result = CalibrationResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects result missing shipRateExclOutliers", () => {
    const { shipRateExclOutliers: _, ...without } = validCalibrationResult;
    const result = CalibrationResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CalibrationRunOutputSchema
// ---------------------------------------------------------------------------

describe("CalibrationRunOutputSchema", () => {
  const validCluster = {
    clusterId: "PROJ-1",
    ids: ["PROJ-1"],
    metadata: {
      type: "Story",
      timestampT0: "2025-01-01T00:00:00.000Z",
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
  };

  const validResidual = {
    clusterId: "PROJ-1",
    actualHours: 16,
    predictedHours: 14,
    residual: 2,
    standardizedResidual: 0.4,
    isOutlier: false,
  };

  it("accepts valid calibration run output", () => {
    const result = CalibrationRunOutputSchema.safeParse({
      result: validCalibrationResult,
      clusters: [validCluster],
      residuals: [validResidual],
      skippedClusters: [
        { clusterId: "PROJ-99", reason: "Low confidence" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects output without result", () => {
    const result = CalibrationRunOutputSchema.safeParse({
      clusters: [validCluster],
      residuals: [validResidual],
      skippedClusters: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts output with empty arrays", () => {
    const result = CalibrationRunOutputSchema.safeParse({
      result: validCalibrationResult,
      clusters: [],
      residuals: [],
      skippedClusters: [],
    });
    expect(result.success).toBe(true);
  });
});
