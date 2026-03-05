import pLimit, { type LimitFunction } from "p-limit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * An LLM concurrency gate that limits the number of simultaneous LLM API
 * calls across all cluster workers.
 *
 * Independent of the cluster worker count — e.g. 5 cluster workers with LLM
 * concurrency 2 means at most 2 LLM calls at any moment.
 */
export interface LlmGate {
  /**
   * Execute `fn` once a concurrency slot is available.
   */
  <T>(fn: () => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a shared LLM concurrency gate.
 *
 * @param concurrency - Maximum concurrent LLM calls (default: 2).
 * @returns An `LlmGate` function wrapping `p-limit`.
 */
export function createLlmGate(concurrency = 2): LlmGate {
  const limit: LimitFunction = pLimit(concurrency);
  return <T>(fn: () => Promise<T>): Promise<T> => limit(fn);
}
