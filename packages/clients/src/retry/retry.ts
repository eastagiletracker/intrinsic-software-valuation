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
   * Optional predicate that identifies stall-timeout errors.
   * When a stall error is detected, the retry uses `stallBaseDelayMs`
   * and `stallMaxRetries` instead of the defaults — allowing longer
   * backoff to survive LLM congestion bursts.
   */
  isStallError?: (error: unknown) => boolean;
  /**
   * Base delay for stall-timeout retries (ms). Default: 10 000.
   * Only applies when `isStallError` returns true.
   */
  stallBaseDelayMs?: number;
  /**
   * Maximum retries for stall-timeout errors. Default: 4.
   * Overrides `maxRetries` when a stall error is detected.
   */
  stallMaxRetries?: number;
  /**
   * Injected delay function — defaults to real `setTimeout`.
   * Override in tests to avoid real waiting.
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
 *
 * When `isStallError` is provided, stall-timeout errors get a longer backoff
 * (`stallBaseDelayMs`, default 10 s) and more retries (`stallMaxRetries`,
 * default 4) to survive LLM congestion bursts.
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
  const isStallError = options?.isStallError;
  const stallBaseDelayMs = options?.stallBaseDelayMs ?? 10_000;
  const stallMaxRetries = options?.stallMaxRetries ?? 4;

  // Use the higher retry count when stall handling is enabled so that
  // stall errors get enough attempts. Non-stall errors still abort at
  // `maxRetries` via the shouldRetry predicate below.
  const effectiveMaxRetries = isStallError
    ? Math.max(maxRetries, stallMaxRetries)
    : maxRetries;

  // Track stall attempts separately to enforce stallMaxRetries.
  let stallAttempts = 0;

  const sleep =
    customDelay ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return pRetry(fn, {
    retries: effectiveMaxRetries,
    randomize: false,
    // Backoff is applied in shouldRetry below so that stall errors can use
    // their own base delay; p-retry's single minTimeout cannot express that.
    minTimeout: 0,
    shouldRetry: async (info) => {
      const err = (info as FailedAttemptError).error;
      const isStall = isStallError ? isStallError(err) : false;

      if (isStall) {
        stallAttempts++;
        if (stallAttempts > stallMaxRetries) return false;
      } else if (shouldRetry && !shouldRetry(err)) {
        return false;
      }

      const attempt = (info as FailedAttemptError).attemptNumber - 1; // 0-based
      const effectiveBase = isStall ? stallBaseDelayMs : baseDelayMs;
      await sleep(effectiveBase * Math.pow(backoffFactor, attempt));
      return true;
    },
    onFailedAttempt: async (info) => {
      if (options?.onFailedAttempt) {
        await options.onFailedAttempt(info as FailedAttemptError);
      }
    },
  });
}
