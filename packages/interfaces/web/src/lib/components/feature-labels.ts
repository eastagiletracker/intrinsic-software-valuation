/**
 * Human-readable labels for ISV calibration regression features.
 *
 * Maps internal feature identifiers (schema enum values) to display names
 * used in report tables and chart axes.
 */

const featureLabels: Record<string, string> = {
  A1_Data: "A1 Data",
  A2_UX: "A2 UX",
  B1_Logic: "B1 Logic",
  C1_Integration: "C1 Integration",
  C2_State: "C2 State",
  D3_Quality: "D3 Quality",
  distributionEntropy: "Distribution Entropy",
  cyclomaticComplexityDelta: "Cyclomatic Complexity Δ",
  changeIntensityScore: "Change Intensity Score",
};

/** Return a human-readable label for a regression feature identifier. */
export function featureLabel(feature: string): string {
  return featureLabels[feature] ?? feature;
}
