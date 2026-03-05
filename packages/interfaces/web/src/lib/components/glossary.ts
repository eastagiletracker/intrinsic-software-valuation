/**
 * Glossary of ISV calibration terms for tooltip explanations.
 *
 * Terms are aligned with docs/concept/ISV Engine - 99 - Glossary.md to avoid
 * semantic drift (AGENTS.md: keep terminology aligned with the glossary).
 */

export const glossary: Record<string, string> = {
  "Ship Rate":
    "Empirical conversion factor expressing Euro (€) of development cost per ISV point. Derived from historical regression using the project's legacy daily rate.",
  "Legacy Daily Rate":
    "The legacy daily rate (€ per 8-hour working day) used to convert the hours-based Ship Rate into a monetary € per ISV metric. Configured per project; defaults to 1,000 €/day.",
  "R²":
    "Coefficient of determination — proportion of variance in actual hours explained by the ISV model. Values > 0.7 indicate strong fit.",
  "Adjusted R²":
    "R² corrected for the number of predictors. Penalises overfitting from too many features.",
  "Data Quality Score":
    "Ratio of (matched + knowledge-based) hours to total tracked hours. Higher values indicate better time-attribution coverage.",
  "Sample Size":
    "Number of ship-unit clusters included in the calibration regression.",
  "Ship Unit Cluster":
    "A logical grouping of one parent story and its subtasks, treated as a single calibration data point.",
  "Partial Correlation":
    "Correlation between one ISV factor and actual hours while controlling for all other factors. Shows unique explanatory power.",
  "Weight (β)":
    "Standardised regression coefficient. Indicates the direction and magnitude of a factor's contribution to the prediction.",
  "p-Value":
    "Probability that the observed correlation is due to chance. Values < 0.05 are considered statistically significant.",
  "Residual":
    "Difference between actual tracked hours and ISV-derived comparison value for a cluster. Large residuals suggest unusual tickets.",
  "Standardised Residual":
    "Residual divided by its standard deviation. Values beyond ±2 flag potential outliers.",
  "Confidence Interval (95%)":
    "Range within which the true Ship Rate is expected to fall with 95% probability.",
  "Coefficient of Variation":
    "Standard error divided by Ship Rate — a normalised measure of estimation uncertainty.",
  "Normality Flag":
    "Result of a residual normality test (Shapiro-Wilk or Kolmogorov-Smirnov). 'pass' means residuals are approximately normal.",
  "Distribution Entropy":
    "Shannon entropy of file-change distribution in a cluster. Higher entropy indicates changes spread across many files.",
  "Cyclomatic Complexity Delta":
    "Estimated change in code complexity resulting from the work in a cluster.",
  "Change Intensity Score":
    "Composite metric combining lines-of-code changes, entropy, and complexity delta (0–1 scale).",
  "DQS":
    "Data Quality Score — ratio of attributable hours to total tracked hours.",
  "KBV":
    "Knowledge-Based Value — hours without corresponding code changes, e.g. meetings, design, reviews.",
  "Outlier":
    "A cluster whose standardised residual exceeds ±2, indicating an unusual deviation from the model.",
  "ISV Score":
    "Intrinsic Software Value — the formula-derived score summarising development complexity for a ticket.",
  "Fit Assessment":
    "Classification of model quality: 'strong' (R² ≥ 0.7), 'moderate' (0.4–0.7), or 'weak' (< 0.4).",
};
