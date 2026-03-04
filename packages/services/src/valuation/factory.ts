import type {
  IsvFactors,
  IsvResult,
  HealthScores,
  C2State,
} from "@isv/domain";

import type { ValuationPort } from "./port.js";
import {
  FORMULA_VERSION,
  calculateBreakdown,
  calculateIsvScore,
} from "./formula.js";
import { deriveC2, aggregateC2 } from "./c2-derivation.js";

/**
 * Default implementation of the Valuation service.
 *
 * Pure deterministic calculation — no I/O, no side effects.
 */
class ValuationService implements ValuationPort {
  calculate(ticketId: string, factors: IsvFactors): IsvResult {
    const breakdown = calculateBreakdown(factors);
    const isvScore = calculateIsvScore(breakdown);

    return {
      formulaVersion: FORMULA_VERSION,
      ticketId,
      factors,
      breakdown,
      isvScore,
    };
  }

  deriveC2(healthScores: HealthScores): C2State {
    return deriveC2(healthScores);
  }

  aggregateC2(c2Values: C2State[]): C2State {
    return aggregateC2(c2Values);
  }
}

/**
 * Create a Valuation service instance.
 *
 * No configuration needed — this is a pure calculation engine.
 */
export function createValuationService(): ValuationPort {
  return new ValuationService();
}
