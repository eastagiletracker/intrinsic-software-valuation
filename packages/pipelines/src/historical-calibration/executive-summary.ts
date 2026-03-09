/**
 * Executive Summary Generator — produces an AI-generated natural language
 * summary of a calibration report using an LLM.
 *
 * The summary captures the key metrics, statistical quality, data
 * representativeness, and actionable findings in plain language.
 */

import type { CalibrationRunOutput } from "@isv/domain";
import type { LlmClient } from "@isv/clients";

const SYSTEM_PROMPT = `You are a technical report writer for software valuation calibration reports.
Write a concise executive summary (3–5 paragraphs) of a historical calibration run.
The summary must be factual, referencing exact numbers from the provided metrics.
Use professional, neutral language suitable for stakeholders and auditors.
Do NOT use markdown formatting, bullet points, or headers — write plain flowing prose.
Do NOT speculate or add information that is not supported by the provided data.`;

/**
 * Build the optional cohort analysis section for the LLM prompt.
 * Returns an empty string when cohort data is absent.
 */
function buildCohortSection(output: CalibrationRunOutput): string {
  if (!output.cohortOverview?.length || !output.cohortCalibrations?.length) {
    return "";
  }

  const overviewLines = output.cohortOverview.map(
    (e) =>
      `- Cohort ${e.cohort} (${e.label}): ${e.clusterCount} clusters (${e.clusterPct.toFixed(1)}%), ${e.totalHours.toFixed(0)} h (${e.hoursPct.toFixed(1)}%)`,
  );

  const calLines = output.cohortCalibrations.map((cc) => {
    const cal = cc.calibration;
    return `- Tier ${cc.key}: ${cc.sampleSize} clusters, R²=${cal.rSquared.toFixed(4)}, Ship Rate=${cal.shipRateHoursPerIsv.toFixed(2)} h/ISV, fit=${cal.formulaValidation.fitAssessment}`;
  });

  const primary = output.primaryCohortKey ?? "A+B+C";

  return `
## Data Cohort Analysis
Clusters are partitioned by data-confidence into cohorts A (high), B (medium), C (low).
The primary calibration tier is "${primary}".

### Cohort Distribution
${overviewLines.join("\n")}

### Tier Calibrations
${calLines.join("\n")}

Include a paragraph comparing how calibration quality changes across tiers and which tier provides the most reliable Ship Rate.
`;
}

/**
 * Build a structured user prompt from the calibration output.
 *
 * Exported for testing.
 */
export function buildSummaryPrompt(
  output: CalibrationRunOutput,
  legacyDailyRate: number,
): string {
  const r = output.result;
  const hourlyRate = legacyDailyRate / 8;
  const euroPerIsv = r.shipRateHoursPerIsv * hourlyRate;
  const euroPerIsvExcl = r.shipRateExclOutliers * hourlyRate;

  const significantFactors = r.factorDiagnostics
    .filter((d) => d.pValue < 0.05)
    .map((d) => d.feature);

  const topFactors = r.formulaValidation.factorRanking
    .slice(0, 3)
    .map((f) => `${f.feature} (|r|=${f.absPartialCorrelation.toFixed(3)})`)
    .join(", ");

  const recommendations = r.formulaValidation.recommendations.join(" ");

  return `Summarise the following calibration report data into an executive summary.

## Calibration Period
- Start: ${r.periodStart}
- End: ${r.periodEnd}

## Sample
- Total clusters analysed: ${r.sampleSize}
- Skipped clusters: ${output.skippedClusters.length}
- Outliers detected: ${r.outliers.outlierCount} (${(r.outliers.outlierPercentage * 100).toFixed(1)}% of sample)

## Ship Rate
- Ship Rate: ${r.shipRateHoursPerIsv.toFixed(2)} h/ISV (${euroPerIsv.toFixed(2)} €/ISV at ${legacyDailyRate} €/day)
- Ship Rate excl. outliers: ${r.shipRateExclOutliers.toFixed(2)} h/ISV (${euroPerIsvExcl.toFixed(2)} €/ISV)
- 95% Confidence Interval: ${r.reliability.confidenceInterval95.lower.toFixed(2)} – ${r.reliability.confidenceInterval95.upper.toFixed(2)} h/ISV
- Standard Error: ${r.reliability.standardError.toFixed(4)}
- Coefficient of Variation: ${(r.reliability.coefficientOfVariation * 100).toFixed(1)}%

## Statistical Quality
- R²: ${r.rSquared.toFixed(4)}
- Adjusted R²: ${r.adjustedRSquared.toFixed(4)}
- Fit Assessment: ${r.formulaValidation.fitAssessment}
- Normality: ${r.normalityAssessment.flag} (${r.normalityAssessment.testName} p=${r.normalityAssessment.pValue.toFixed(4)})

## Data Quality
- Data Quality Score (DQS): ${(r.dataQualityScore * 100).toFixed(1)}%
- Normality Flag: ${r.reliability.normalityFlag}

## Factor Analysis
- Statistically significant factors (p < 0.05): ${significantFactors.length > 0 ? significantFactors.join(", ") : "none"}
- Top 3 features by explanatory power: ${topFactors}
- Git metrics outperforming ISV factors: ${r.formulaValidation.mismatches.gitMetricsOutperformingIsv ? "yes" : "no"}

## Recommendations
${recommendations || "None."}
${buildCohortSection(output)}
Write the executive summary now.`;
}

/**
 * Generate an AI executive summary for a calibration report.
 *
 * @param output - The completed calibration run output.
 * @param llmClient - LLM client for text generation.
 * @param legacyDailyRate - Daily rate in € (8h day) for Euro conversion.
 * @returns The summary text, or `undefined` if generation fails (non-critical).
 */
export async function generateExecutiveSummary(
  output: CalibrationRunOutput,
  llmClient: LlmClient,
  legacyDailyRate: number,
): Promise<string | undefined> {
  const userPrompt = buildSummaryPrompt(output, legacyDailyRate);

  const result = await llmClient.prompt({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.4,
    maxTokens: 2000,
  });

  if (!result.success) {
    // Summary generation is non-critical — log and return undefined
    console.warn(
      "[executive-summary] LLM call failed, skipping summary:",
      result.error.message,
    );
    return undefined;
  }

  const text = result.data.trim();
  if (text.length === 0) return undefined;

  return text;
}
