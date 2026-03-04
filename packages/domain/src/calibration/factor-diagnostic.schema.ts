import { z } from "zod";

/**
 * Statistical diagnostic for a single ISV factor across a calibration sample.
 *
 * Produced as part of the optional advanced diagnostics output of a
 * calibration run. Each entry describes how well one factor (e.g. A1_Data)
 * correlates with actual invested hours while controlling for all other factors.
 *
 * These diagnostics validate the static ISV formula against empirical data.
 * They inform human decisions about potential formula revisions but
 * never trigger automatic adjustments.
 */
export const FactorDiagnosticSchema = z
  .object({
    factor: z
      .enum([
        "A1_Data",
        "A2_UX",
        "B1_Logic",
        "C1_Integration",
        "C2_State",
        "D3_Quality",
      ])
      .describe("Name of the ISV factor this diagnostic describes"),
    partialCorrelation: z
      .number()
      .min(-1)
      .max(1)
      .describe(
        "Partial correlation (r) of this factor with actual hours, " +
          "controlling for all other factors. Reveals individual explanatory power.",
      ),
    weight: z
      .number()
      .describe(
        "Standardized regression coefficient (β). " +
          "Empirical direction and magnitude of the factor's influence on time invested.",
      ),
    pValue: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Statistical significance of the factor's contribution. " +
          "Factors with p > 0.05 may not carry meaningful signal.",
      ),
  })
  .describe(
    "Per-factor statistical diagnostic from calibration regression. " +
      "Informs human review of the static ISV formula — never triggers automatic changes.",
  );

export type FactorDiagnostic = z.infer<typeof FactorDiagnosticSchema>;
