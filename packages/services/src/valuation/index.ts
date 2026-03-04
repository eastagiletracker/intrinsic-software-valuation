// Valuation service — pure deterministic ISV formula engine.
export type { ValuationPort } from "./port.js";
export { createValuationService } from "./factory.js";
export { FORMULA_VERSION, calculateBreakdown, calculateIsvScore } from "./formula.js";
export { deriveC2, aggregateC2 } from "./c2-derivation.js";
