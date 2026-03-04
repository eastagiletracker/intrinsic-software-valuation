import type {
  IsvFactors,
  IsvResult,
  HealthScores,
  C2State,
} from "@isv/domain";

/**
 * Valuation service port.
 *
 * Pure deterministic calculation — no I/O, no AI.
 * Takes ISV factors and produces a scored result.
 */
export interface ValuationPort {
  /**
   * Calculate the ISV score for a single ticket.
   *
   * @param ticketId - The ticket being valued.
   * @param factors - All six ISV factors.
   * @returns The complete ISV result with formula version, breakdown, and score.
   */
  calculate(ticketId: string, factors: IsvFactors): IsvResult;

  /**
   * Derive the C2 State Factor from health scores.
   *
   * Uses the penalty model from the Valuation concept doc v3.4.
   *
   * @param healthScores - Repository health scores from the Status Quo Miner.
   * @returns C2 value: 1 (clean), 2 (moderate debt), or 3 (toxic legacy).
   */
  deriveC2(healthScores: HealthScores): C2State;

  /**
   * Aggregate C2 across multiple repositories.
   *
   * @param c2Values - Per-repository C2 values.
   * @returns The effective C2 (max across all repos).
   */
  aggregateC2(c2Values: C2State[]): C2State;
}
