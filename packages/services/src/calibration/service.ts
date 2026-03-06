import type {
  CalibrationResult,
  ShipUnitCluster,
  AttributedTimeEntry,
  Ticket,
  TimeEntry,
  Result,
  ClusterResidual,
  NormalityAssessment,
  OutlierReport,
  OutlierEntry,
  ReliabilitySummary,
  FormulaValidation,
  RegressionFeatureDiagnostic,
  FactorRankingEntry,
} from "@isv/domain";

import type { CalibrationPort } from "./port.js";
import { FORMULA_VERSION } from "../valuation/formula.js";
import {
  olsRegression,
  partialCorrelation,
  linearRegression as simpleLinearRegression,
  shannonEntropy,
  changeIntensityScore,
  shapiroWilk,
  kolmogorovSmirnov,
  skewness,
  kurtosis,
  confidenceInterval95,
} from "./statistics.js";

/** Feature names in the order they appear in the regression matrix. */
const FEATURE_NAMES = [
  "A1_Data",
  "A2_UX",
  "B1_Logic",
  "C1_Integration",
  "C2_State",
  "D3_Quality",
  "distributionEntropy",
  "cyclomaticComplexityDelta",
  "changeIntensityScore",
] as const;

type FeatureName = (typeof FEATURE_NAMES)[number];

// ---------------------------------------------------------------------------
// Ticket clustering
// ---------------------------------------------------------------------------

/**
 * Cluster tickets by parent-subtask relationship.
 *
 * A cluster consists of a parent ticket + all its subtasks.
 * Tickets without parents become their own single-ticket cluster.
 */
function clusterTickets(tickets: Ticket[]): Map<string, Ticket[]> {
  const clusters = new Map<string, Ticket[]>();

  // Index by ticketId for quick lookup
  const ticketMap = new Map<string, Ticket>();
  for (const t of tickets) {
    ticketMap.set(t.ticketId, t);
  }

  for (const t of tickets) {
    const clusterId = t.parentId ?? t.ticketId;

    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, []);
    }
    clusters.get(clusterId)!.push(t);
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Time attribution (5 strategies)
// ---------------------------------------------------------------------------

function attributeTime(
  entries: TimeEntry[],
  clusters: Map<string, Ticket[]>,
): AttributedTimeEntry[] {
  const attributed: AttributedTimeEntry[] = [];

  // Build reverse index: ticketId → clusterId
  const ticketToCluster = new Map<string, string>();
  for (const [clusterId, tickets] of clusters) {
    for (const t of tickets) {
      ticketToCluster.set(t.ticketId, clusterId);
    }
  }

  for (const entry of entries) {
    const ids = entry.detectedIds;

    if (ids.length === 0) {
      // Strategy 5: no-ID — unlinked overhead
      attributed.push({
        timestamp: entry.timestamp,
        originalDurationHours: entry.durationHours,
        attributedHours: entry.durationHours,
        attributionReason: "No ticket IDs detected — classified as unlinked overhead",
      });
      continue;
    }

    // Find matching clusters
    const matchingClusters = new Set<string>();
    for (const id of ids) {
      const cid = ticketToCluster.get(id);
      if (cid) matchingClusters.add(cid);
    }

    if (matchingClusters.size === 0) {
      // Strategy 4: threshold — ticket IDs present but no matching cluster
      attributed.push({
        timestamp: entry.timestamp,
        originalDurationHours: entry.durationHours,
        attributedHours: entry.durationHours,
        attributionReason: `Ticket IDs ${ids.join(", ")} found but no matching cluster — KBV`,
      });
      continue;
    }

    if (matchingClusters.size === 1) {
      const clusterId = [...matchingClusters][0];

      if (ids.length === 1) {
        // Strategy 1: direct match
        attributed.push({
          timestamp: entry.timestamp,
          originalDurationHours: entry.durationHours,
          attributedClusterId: clusterId,
          attributedHours: entry.durationHours,
          attributionReason: `Direct match: ${ids[0]} → cluster ${clusterId}`,
        });
      } else {
        // Strategy 2: cluster match (multiple IDs, same cluster)
        attributed.push({
          timestamp: entry.timestamp,
          originalDurationHours: entry.durationHours,
          attributedClusterId: clusterId,
          attributedHours: entry.durationHours,
          attributionReason: `Cluster match: ${ids.join(", ")} all map to cluster ${clusterId}`,
        });
      }
    } else {
      // Strategy 3: multi-ID split across clusters
      const splitHours = entry.durationHours / matchingClusters.size;
      for (const clusterId of matchingClusters) {
        attributed.push({
          timestamp: entry.timestamp,
          originalDurationHours: entry.durationHours,
          attributedClusterId: clusterId,
          attributedHours: splitHours,
          attributionReason: `Multi-ID split: ${entry.durationHours}h ÷ ${matchingClusters.size} clusters = ${splitHours}h for cluster ${clusterId}`,
        });
      }
    }
  }

  return attributed;
}

// ---------------------------------------------------------------------------
// Data Quality Score
// ---------------------------------------------------------------------------

function calculateDqs(attributed: AttributedTimeEntry[]): number {
  if (attributed.length === 0) return 0;

  let totalHours = 0;
  let matchedOrKbvHours = 0;

  for (const entry of attributed) {
    totalHours += entry.attributedHours;
    if (entry.attributedClusterId !== undefined) {
      // Matched (direct, cluster, or split)
      matchedOrKbvHours += entry.attributedHours;
    } else if (entry.attributionReason.includes("KBV")) {
      // KBV entries count toward DQS
      matchedOrKbvHours += entry.attributedHours;
    }
  }

  return totalHours > 0 ? matchedOrKbvHours / totalHours : 0;
}

// ---------------------------------------------------------------------------
// Ship Rate regression (simple linear regression — kept for fallback)
// ---------------------------------------------------------------------------

function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number; rSquared: number } {
  return simpleLinearRegression(points);
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

function extractFeatureRow(c: ShipUnitCluster): number[] {
  return [
    c.isvAnalysis.factors.A1_Data,
    c.isvAnalysis.factors.A2_UX,
    c.isvAnalysis.factors.B1_Logic,
    c.isvAnalysis.factors.C1_Integration,
    c.isvAnalysis.factors.C2_State,
    c.isvAnalysis.factors.D3_Quality,
    c.metrics.gitChanges.distributionEntropy,
    c.metrics.gitChanges.cyclomaticComplexityDelta,
    c.metrics.gitChanges.changeIntensityScore,
  ];
}

// ---------------------------------------------------------------------------
// Outlier detection
// ---------------------------------------------------------------------------

function classifyOutlierReason(
  cluster: ShipUnitCluster,
  stdResidual: number,
): string {
  const gc = cluster.metrics.gitChanges;
  if (
    gc.locAdded === 0 &&
    gc.locDeleted === 0 &&
    gc.filesChanged === 0
  ) {
    return "ZERO_GIT_CHANGES";
  }
  if (stdResidual > 0 && cluster.metrics.totalHours > 200) {
    return "EXTREME_HOURS";
  }
  if (stdResidual < 0 && cluster.metrics.totalHours < 1) {
    return "NEAR_ZERO_HOURS";
  }
  return "HIGH_KBV_RATIO";
}

// ---------------------------------------------------------------------------
// Normality assessment
// ---------------------------------------------------------------------------

function assessNormality(residuals: number[]): NormalityAssessment {
  const n = residuals.length;
  const sk = skewness(residuals);
  const ku = kurtosis(residuals);

  let testName: "shapiro-wilk" | "kolmogorov-smirnov";
  let testStatistic: number;
  let pValue: number;

  if (n < 50) {
    const sw = shapiroWilk(residuals);
    testName = "shapiro-wilk";
    testStatistic = sw.W;
    pValue = sw.pValue;
  } else {
    const ks = kolmogorovSmirnov(residuals);
    testName = "kolmogorov-smirnov";
    testStatistic = ks.D;
    pValue = ks.pValue;
  }

  const flag: "pass" | "warning" | "fail" =
    pValue >= 0.05 ? "pass" : pValue >= 0.01 ? "warning" : "fail";

  return { testName, testStatistic, pValue, skewness: sk, kurtosis: ku, flag };
}

// ---------------------------------------------------------------------------
// Formula validation
// ---------------------------------------------------------------------------

function buildFormulaValidation(
  rSquared: number,
  shipRate: number,
  dqs: number,
  diagnostics: RegressionFeatureDiagnostic[],
): FormulaValidation {
  // Fit assessment
  const fitAssessment =
    rSquared >= 0.7 ? "strong" : rSquared >= 0.4 ? "moderate" : "weak";

  // Ship Rate reliability
  const shipRateReliability =
    rSquared >= 0.7
      ? `Ship Rate of ${shipRate.toFixed(2)} h/ISV is statistically reliable (R²=${rSquared.toFixed(3)})`
      : rSquared >= 0.4
        ? `Ship Rate of ${shipRate.toFixed(2)} h/ISV has moderate reliability — use with caution (R²=${rSquared.toFixed(3)})`
        : `Ship Rate of ${shipRate.toFixed(2)} h/ISV has low reliability — not recommended for planning (R²=${rSquared.toFixed(3)})`;

  // Data quality assessment
  const dataQualityAssessment =
    dqs >= 0.85
      ? `Data quality is good (DQS=${(dqs * 100).toFixed(1)}%)`
      : dqs >= 0.7
        ? `Data quality is acceptable but could be improved (DQS=${(dqs * 100).toFixed(1)}%)`
        : `Data quality is low — calibration results may not be trustworthy (DQS=${(dqs * 100).toFixed(1)}%)`;

  // Factor ranking
  const factorRanking: FactorRankingEntry[] = diagnostics
    .map((d) => ({
      feature: d.feature,
      absPartialCorrelation: Math.abs(d.partialCorrelation),
      isSignificant: d.pValue < 0.05,
    }))
    .sort((a, b) => b.absPartialCorrelation - a.absPartialCorrelation);

  // Mismatch detection
  const multiplicativeFactors = ["C1_Integration", "C2_State", "D3_Quality"];
  const additiveFactors = ["A1_Data", "A2_UX", "B1_Logic"];
  const gitMetrics = [
    "distributionEntropy",
    "cyclomaticComplexityDelta",
    "changeIntensityScore",
  ];

  const multiplicativeFactorsWithLowWeight = diagnostics
    .filter(
      (d) =>
        multiplicativeFactors.includes(d.feature) &&
        Math.abs(d.partialCorrelation) < 0.15,
    )
    .map((d) => d.feature);

  const additiveFactorsWithDominantWeight = diagnostics
    .filter(
      (d) =>
        additiveFactors.includes(d.feature) &&
        Math.abs(d.partialCorrelation) > 0.5,
    )
    .map((d) => d.feature);

  const isvAvgCorr =
    diagnostics
      .filter((d) => !gitMetrics.includes(d.feature))
      .reduce((sum, d) => sum + Math.abs(d.partialCorrelation), 0) /
    Math.max(
      diagnostics.filter((d) => !gitMetrics.includes(d.feature)).length,
      1,
    );

  const gitAvgCorr =
    diagnostics
      .filter((d) => gitMetrics.includes(d.feature))
      .reduce((sum, d) => sum + Math.abs(d.partialCorrelation), 0) /
    Math.max(
      diagnostics.filter((d) => gitMetrics.includes(d.feature)).length,
      1,
    );

  const gitMetricsOutperformingIsv = gitAvgCorr > isvAvgCorr;

  // Recommendations
  const recommendations: string[] = [];

  for (const d of diagnostics) {
    if (d.pValue > 0.1 && !gitMetrics.includes(d.feature)) {
      recommendations.push(
        `Factor ${d.feature} shows no significant correlation (p=${d.pValue.toFixed(3)}) — review scale definitions`,
      );
    }
  }

  if (gitMetricsOutperformingIsv) {
    recommendations.push(
      "Git metrics explain more variance than ISV factors — consider integrating change metrics into the formula",
    );
  }

  if (multiplicativeFactorsWithLowWeight.length > 0) {
    recommendations.push(
      `Multiplicative factors ${multiplicativeFactorsWithLowWeight.join(", ")} have low empirical weight — consider scale adjustment`,
    );
  }

  // Detect zero-hours degenerate case
  const allHoursZero = diagnostics.every(
    (d) => d.partialCorrelation === 0 && d.pValue === 1,
  ) && rSquared === 0;

  if (allHoursZero) {
    recommendations.unshift(
      "All tracked hours are zero — time tracking data appears to be missing or not yet attributed. Statistical analysis is not meaningful without actual effort data.",
    );
  }

  if (fitAssessment === "weak") {
    recommendations.push(
      "Overall model fit is weak — increase sample size or review factor definitions before relying on Ship Rate",
    );
  }

  return {
    fitAssessment,
    shipRateReliability,
    dataQualityAssessment,
    factorRanking,
    mismatches: {
      multiplicativeFactorsWithLowWeight,
      additiveFactorsWithDominantWeight,
      gitMetricsOutperformingIsv,
    },
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Main calibrate function
// ---------------------------------------------------------------------------

function calibrate(clusters: ShipUnitCluster[]): Result<CalibrationResult> {
  if (clusters.length < 2) {
    return {
      success: false,
      error: {
        code: "INSUFFICIENT_DATA",
        message: `Need at least 2 clusters for regression, got ${clusters.length}`,
        source: "calibration",
      },
    };
  }

  // Simple scalar Ship Rate (always computed for backward compatibility)
  const simplePoints = clusters.map((c) => ({
    x: c.isvAnalysis.isvScore,
    y: c.metrics.totalHours,
  }));
  const simpleResult = linearRegression(simplePoints);
  const simpleShipRate = Math.max(simpleResult.slope, 0.01);

  // Build feature matrix and response vector
  const X = clusters.map(extractFeatureRow);
  const y = clusters.map((c) => c.metrics.totalHours);

  const minSampleForMultivariate = 2 * FEATURE_NAMES.length; // 18
  const useMultivariate = clusters.length >= minSampleForMultivariate;

  let rSquared: number;
  let adjustedRSquared: number;
  let residuals: number[];
  let predicted: number[];
  let featureCoefficients: number[];
  let featurePValues: number[];
  let residualStdDev: number;

  if (useMultivariate) {
    const ols = olsRegression(X, y);
    if (ols) {
      rSquared = ols.rSquared;
      adjustedRSquared = ols.adjustedRSquared;
      residuals = ols.residuals;
      predicted = ols.predicted;
      // Skip intercept (index 0)
      featureCoefficients = ols.coefficients.slice(1);
      featurePValues = ols.pValues.slice(1);
      residualStdDev = ols.residualStdDev;
    } else {
      // Fallback to simple regression if OLS fails
      rSquared = Math.max(0, Math.min(1, simpleResult.rSquared));
      adjustedRSquared = rSquared;
      predicted = simplePoints.map(
        (p) => simpleResult.slope * p.x + simpleResult.intercept,
      );
      residuals = y.map((yi, i) => yi - predicted[i]);
      featureCoefficients = FEATURE_NAMES.map(() => 0);
      featurePValues = FEATURE_NAMES.map(() => 1);
      const ssRes = residuals.reduce((a, r) => a + r * r, 0);
      residualStdDev = Math.sqrt(
        ssRes / Math.max(clusters.length - 2, 1),
      );
    }
  } else {
    // Sample too small for multivariate — use simple regression
    rSquared = Math.max(0, Math.min(1, simpleResult.rSquared));
    adjustedRSquared = rSquared;
    predicted = simplePoints.map(
      (p) => simpleResult.slope * p.x + simpleResult.intercept,
    );
    residuals = y.map((yi, i) => yi - predicted[i]);
    featureCoefficients = FEATURE_NAMES.map(() => 0);
    featurePValues = FEATURE_NAMES.map(() => 1);
    const ssRes = residuals.reduce((a, r) => a + r * r, 0);
    residualStdDev = Math.sqrt(ssRes / Math.max(clusters.length - 2, 1));
  }

  // Standardized residuals
  const stdResiduals =
    residualStdDev > 0
      ? residuals.map((r) => r / residualStdDev)
      : residuals.map(() => 0);

  // Factor-level diagnostics
  const diagnostics: RegressionFeatureDiagnostic[] = FEATURE_NAMES.map(
    (name, j) => {
      let pc = 0;
      if (useMultivariate && clusters.length >= 3) {
        pc = partialCorrelation(X, y, j);
      }
      return {
        feature: name as FeatureName,
        partialCorrelation: Math.max(-1, Math.min(1, pc)),
        weight: featureCoefficients[j],
        pValue: Math.max(0, Math.min(1, featurePValues[j])),
      };
    },
  );

  // Cluster residuals
  const clusterResiduals: ClusterResidual[] = clusters.map((c, i) => ({
    clusterId: c.clusterId,
    actualHours: c.metrics.totalHours,
    predictedHours: predicted[i],
    residual: residuals[i],
    standardizedResidual: stdResiduals[i],
    isOutlier: Math.abs(stdResiduals[i]) > 2,
  }));

  // Outlier detection
  const outlierEntries: OutlierEntry[] = clusterResiduals
    .filter((cr) => cr.isOutlier)
    .map((cr, _idx) => {
      const cluster = clusters.find((c) => c.clusterId === cr.clusterId)!;
      return {
        clusterId: cr.clusterId,
        residual: cr.residual,
        standardizedResidual: cr.standardizedResidual,
        reason: classifyOutlierReason(cluster, cr.standardizedResidual),
      };
    });

  const outliers: OutlierReport = {
    outlierCount: outlierEntries.length,
    outlierPercentage:
      clusters.length > 0 ? outlierEntries.length / clusters.length : 0,
    entries: outlierEntries,
  };

  // Ship Rate excluding outliers
  const nonOutlierClusters = clusters.filter(
    (_, i) => !clusterResiduals[i].isOutlier,
  );
  let shipRateExclOutliers = simpleShipRate;
  if (nonOutlierClusters.length >= 2) {
    const exclPoints = nonOutlierClusters.map((c) => ({
      x: c.isvAnalysis.isvScore,
      y: c.metrics.totalHours,
    }));
    const exclResult = linearRegression(exclPoints);
    shipRateExclOutliers = Math.max(exclResult.slope, 0.01);
  }

  // Normality assessment
  const normalityAssessment = assessNormality(residuals);

  // Reliability summary
  const effectiveSampleSize = nonOutlierClusters.length;
  const shipRates = clusters.map(
    (c) =>
      c.isvAnalysis.isvScore > 0
        ? c.metrics.totalHours / c.isvAnalysis.isvScore
        : 0,
  );
  const validShipRates = shipRates.filter((r) => r > 0);
  const meanRate =
    validShipRates.length > 0
      ? validShipRates.reduce((a, b) => a + b, 0) / validShipRates.length
      : simpleShipRate;
  const variance =
    validShipRates.length > 1
      ? validShipRates.reduce((a, b) => a + (b - meanRate) ** 2, 0) /
        (validShipRates.length - 1)
      : 0;
  const standardError = Math.sqrt(
    variance / Math.max(validShipRates.length, 1),
  );
  const ci = confidenceInterval95(
    simpleShipRate,
    standardError,
    clusters.length,
  );
  const coefficientOfVariation =
    simpleShipRate > 0 ? standardError / simpleShipRate : 0;

  const reliability: ReliabilitySummary = {
    sampleSize: clusters.length,
    effectiveSampleSize,
    standardError,
    confidenceInterval95: ci,
    coefficientOfVariation,
    dataQualityScore: 1, // Placeholder — overridden by pipeline
    normalityFlag: normalityAssessment.flag,
  };

  // Formula validation
  const formulaValidation = buildFormulaValidation(
    rSquared,
    simpleShipRate,
    reliability.dataQualityScore,
    diagnostics,
  );

  // Period
  const timestamps = clusters.map((c) => c.metadata.timestampT0);
  const sorted = [...timestamps].sort();

  return {
    success: true,
    data: {
      formulaVersion: FORMULA_VERSION,
      shipRateHoursPerIsv: simpleShipRate,
      shipRateExclOutliers,
      rSquared: Math.max(0, Math.min(1, rSquared)),
      adjustedRSquared: Math.min(1, adjustedRSquared),
      dataQualityScore: 1, // Placeholder — set by pipeline
      sampleSize: clusters.length,
      periodStart: sorted[0],
      periodEnd: sorted[sorted.length - 1],
      factorDiagnostics: diagnostics,
      reliability,
      outliers,
      normalityAssessment,
      formulaValidation,
    },
  };
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

class CalibrationService implements CalibrationPort {
  clusterTickets(tickets: Ticket[]) {
    return clusterTickets(tickets);
  }

  attributeTime(entries: TimeEntry[], clusters: Map<string, Ticket[]>) {
    return attributeTime(entries, clusters);
  }

  calculateDqs(attributed: AttributedTimeEntry[]) {
    return calculateDqs(attributed);
  }

  calibrate(clusters: ShipUnitCluster[]) {
    return calibrate(clusters);
  }
}

/**
 * Create a Calibration service instance.
 */
export function createCalibrationService(): CalibrationPort {
  return new CalibrationService();
}

// Exported for testing
export { clusterTickets, attributeTime, calculateDqs, linearRegression };
