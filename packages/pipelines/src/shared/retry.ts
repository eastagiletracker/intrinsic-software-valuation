import pRetry from "p-retry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** p-retry v7 error info passed to onFailedAttempt / shouldRetry callbacks. */
export interface FailedAttemptError {
  error: Error;
  attemptNumber: number;
  retriesLeft: number;
  retriesConsumed: number;
}

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
   * Injected delay function — defaults to real `setTimeout`.
   * Override in tests to avoid real waiting. When provided, p-retry's
   * internal timing is minimised and the custom delay is invoked instead.
   */
  delay?: (ms: number) => Promise<void>;
  /**
   * Called on each failed attempt. Receives the attempt info from `p-retry`.
   */
  onFailedAttempt?: (error: FailedAttemptError) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Retry an async function with exponential backoff.
 *
 * Backed by `p-retry`. After all retries are exhausted the **original** error
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
  const customDelay = options?.delay;

  return pRetry(fn, {
    retries: maxRetries,
    randomize: false,
    // When a custom delay is provided (tests), minimise p-retry's own
    // backoff timing and handle delays ourselves in onFailedAttempt.
    ...(customDelay
      ? { minTimeout: 1, maxTimeout: 1, factor: 1 }
      : { minTimeout: baseDelayMs, factor: backoffFactor }),
    shouldRetry: shouldRetry
      ? (info) => shouldRetry((info as FailedAttemptError).error)
      : undefined,
    onFailedAttempt: async (info) => {
      const failedAttempt = info as FailedAttemptError;
      if (options?.onFailedAttempt) {
        await options.onFailedAttempt(failedAttempt);
      }
      if (customDelay) {
        // Skip delay when shouldRetry returned false — p-retry calls
        // onFailedAttempt before checking shouldRetry, so we guard here.
        if (shouldRetry && !shouldRetry(failedAttempt.error)) return;
        const attempt = failedAttempt.attemptNumber - 1; // 0-based
        const delayMs = baseDelayMs * Math.pow(backoffFactor, attempt);
        await customDelay(delayMs);
      }
    },
  });
}
