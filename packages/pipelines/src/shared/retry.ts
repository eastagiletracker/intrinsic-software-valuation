import { setTimeout } from "node:timers/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the generic retry utility. */
export interface RetryOptions {
  /** Maximum number of retries after the initial attempt. Default: 3. */
  maxRetries?: number;
  /** Base delay in milliseconds before the first retry. Default: 1 000. */
  baseDelayMs?: number;
  /** Multiplier applied per retry attempt. Default: 2. */
  backoffFactor?: number;
  /**
   * Optional predicate that decides whether a given error is retryable.
   * When provided, only errors for which `shouldRetry(error)` returns `true`
   * trigger a retry. All other errors are thrown immediately.
   */
  shouldRetry?: (error: unknown) => boolean;
  /**
   * Injected delay function — defaults to `setTimeout` from `node:timers/promises`.
   * Override in tests to avoid real waiting.
   */
  delay?: (ms: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Retry an async function with exponential backoff.
 *
 * Attempt _n_ (1-based) waits `baseDelayMs × backoffFactor^(n−1)` ms
 * before retrying. After all retries are exhausted the **original** error
 * is thrown (not wrapped).
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1_000;
  const backoffFactor = options?.backoffFactor ?? 2;
  const shouldRetry = options?.shouldRetry;
  const wait = options?.delay ?? setTimeout;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // If a predicate is provided and says "don't retry", throw immediately.
      if (shouldRetry && !shouldRetry(err)) {
        throw err;
      }

      // If we've exhausted all retries, throw.
      if (attempt >= maxRetries) {
        throw err;
      }

      // Exponential backoff: baseDelayMs × backoffFactor^attempt
      const delayMs = baseDelayMs * Math.pow(backoffFactor, attempt);
      await wait(delayMs);
    }
  }

  // Unreachable, but satisfies TypeScript.
  throw lastError;
}
