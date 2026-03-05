import type { Result } from "@isv/domain";

import type { LlmQuery } from "./query.schema.js";

/**
 * High-level LLM client interface.
 *
 * Provides a simple text-in / text-out interface for sending prompts to
 * an LLM provider. Callers never need to know the underlying provider
 * or connection mechanism.
 *
 * Domain-specific prompt construction and response parsing belong to the
 * service layer — the client only handles transport and connection.
 */
export interface LlmClient {
  /**
   * Send a prompt to the LLM and receive the raw text response.
   *
   * @param query - Structured query with system/user prompts and optional parameters.
   * @returns A `Promise` resolving to a `Result<string>` with the raw LLM text.
   */
  prompt(query: LlmQuery & { signal?: AbortSignal }): Promise<Result<string>>;
}
