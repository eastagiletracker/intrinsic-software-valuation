import type { IsvFactors, IsvBreakdown } from "@isv/domain";

/**
 * ISV formula version identifier.
 *
 * Embedded in every `IsvResult` for legal traceability.
 */
export const FORMULA_VERSION = "3.4";

/**
 * Calculate the ISV breakdown from the six input factors.
 *
 * ISV = ((A1 × A2) + B1) × (C1 × C2) × D3
 *
 * - PO value (functional value): (A1 × A2) + B1
 * - Architecture factor: C1 × C2
 * - Quality multiplier: D3
 */
export function calculateBreakdown(factors: IsvFactors): IsvBreakdown {
  const poValue = factors.A1_Data * factors.A2_UX + factors.B1_Logic;
  const archFactor = factors.C1_Integration * factors.C2_State;
  const qualityMultiplier = factors.D3_Quality;

  return { poValue, archFactor, qualityMultiplier };
}

/**
 * Calculate the final ISV score from a breakdown.
 *
 * ISV = poValue × archFactor × qualityMultiplier
 */
export function calculateIsvScore(breakdown: IsvBreakdown): number {
  return breakdown.poValue * breakdown.archFactor * breakdown.qualityMultiplier;
}
