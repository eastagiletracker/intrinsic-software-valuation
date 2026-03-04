import type { HealthScores, C2State } from "@isv/domain";

/**
 * C2 State Factor penalty model (ISV formula v3.4).
 *
 * Each code-health metric contributes a penalty score (0–2 or 0–1).
 * The total penalty maps to a C2 value:
 *
 * | Total Penalty | C2 |
 * |---------------|----|
 * | 0–1           | 1  |
 * | 2–4           | 2  |
 * | 5+            | 3  |
 *
 * Multi-repo aggregation: effectiveC2 = Math.max(...perRepoC2Values)
 */

/**
 * Calculate the penalty for average cyclomatic complexity.
 * <5 → 0, 5–15 → 1, >15 → 2
 */
function complexityPenalty(avgCyclomaticComplexity: number): number {
  if (avgCyclomaticComplexity < 5) return 0;
  if (avgCyclomaticComplexity <= 15) return 1;
  return 2;
}

/**
 * Calculate the penalty for duplication percentage.
 * <5 → 0, 5–20 → 1, >20 → 2
 */
function duplicationPenalty(duplicationPercentage: number): number {
  if (duplicationPercentage < 5) return 0;
  if (duplicationPercentage <= 20) return 1;
  return 2;
}

/**
 * Calculate the penalty for test coverage.
 * ≥70 → 0, 40–70 → 1, <40 → 2
 *
 * When coverage is unknown (undefined), assume worst case: penalty = 2.
 */
function coveragePenalty(coveragePercentage: number | undefined): number {
  if (coveragePercentage === undefined) return 2;
  if (coveragePercentage >= 70) return 0;
  if (coveragePercentage >= 40) return 1;
  return 2;
}

/**
 * Calculate the penalty for god class count.
 * <5 → 0, ≥5 → 1
 */
function godClassPenalty(godClassCount: number): number {
  return godClassCount < 5 ? 0 : 1;
}

/**
 * Derive the C2 State Factor from health scores using the penalty model.
 *
 * @param healthScores - Repository health scores from the Status Quo Miner.
 * @returns C2 value: 1 (clean), 2 (moderate debt), or 3 (toxic legacy).
 */
export function deriveC2(healthScores: HealthScores): C2State {
  const totalPenalty =
    complexityPenalty(healthScores.complexity.avgCyclomaticComplexity) +
    duplicationPenalty(healthScores.complexity.duplicationPercentage) +
    coveragePenalty(healthScores.testHealth.coveragePercentage) +
    godClassPenalty(healthScores.complexity.godClassCount);

  if (totalPenalty <= 1) return 1;
  if (totalPenalty <= 4) return 2;
  return 3;
}

/**
 * Aggregate C2 across multiple repositories.
 *
 * Any single toxic repo poisons the system intervention:
 * effectiveC2 = max(perRepoC2Values).
 *
 * @param c2Values - Per-repository C2 values (at least one required).
 * @returns The effective C2 for the whole system.
 */
export function aggregateC2(c2Values: C2State[]): C2State {
  if (c2Values.length === 0) {
    throw new Error("aggregateC2 requires at least one C2 value");
  }
  return Math.max(...c2Values) as C2State;
}
