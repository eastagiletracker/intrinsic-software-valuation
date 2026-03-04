import type { GapAnalyzerPort } from "./port.js";
import { GapAnalyzerService } from "./service.js";

/**
 * Create a Gap Analyzer service instance.
 *
 * @returns A configured `GapAnalyzerPort`.
 */
export function createGapAnalyzer(): GapAnalyzerPort {
  return new GapAnalyzerService();
}
