import type { Result } from "@isv/domain";

import { retryAsync, type RetryOptions } from "../retry/index.js";
import { isLlmStallError, LLM_STALL_CODE } from "./github-copilot-cli/index.js";

/**
 * Run an `LlmClient` call and retry it while it fails with a stall timeout.
 *
 * `LlmClient.prompt()` reports failures as a `Result` instead of throwing,
 * so wrapping it in `retryAsync` directly never retries anything. This
 * helper turns an `LLM_STALL` result into a thrown stall error for the
 * retry loop, so stalls get the stall backoff (`stallBaseDelayMs`) and
 * retry budget (`stallMaxRetries`).
 *
 * Successes and non-stall failures are returned on the first attempt.
 * When the stall retries are exhausted, the last stall result is returned.
 */
export async function retryOnLlmStall<T>(
  fn: () => Promise<Result<T>>,
  options?: Omit<RetryOptions, "isStallError" | "shouldRetry">,
): Promise<Result<T>> {
  let lastStall: Result<T> | undefined;

  try {
    return await retryAsync(
      async () => {
        const result = await fn();
        if (!result.success && result.error.code === LLM_STALL_CODE) {
          lastStall = result;
          throw Object.assign(new Error(result.error.message), {
            code: LLM_STALL_CODE,
          });
        }
        return result;
      },
      {
        ...options,
        isStallError: isLlmStallError,
        shouldRetry: isLlmStallError,
      },
    );
  } catch (err) {
    if (lastStall && isLlmStallError(err)) return lastStall;
    throw err;
  }
}
