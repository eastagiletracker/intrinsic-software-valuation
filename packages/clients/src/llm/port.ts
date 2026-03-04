/**
 * Input for an LLM prompt invocation.
 */
export interface LlmPromptInput {
  /** System-level instruction for the LLM. */
  readonly systemPrompt: string;
  /** User-level prompt content. */
  readonly userPrompt: string;
  /** Sampling temperature (0–2). Lower = more deterministic. */
  readonly temperature?: number;
  /** Maximum tokens to generate in the response. */
  readonly maxTokens?: number;
  /** Optional working directory for CLI-based adapters. */
  readonly cwd?: string;
}

/**
 * Result of an LLM prompt invocation.
 */
export interface LlmPromptResult {
  /** Raw text response from the LLM. */
  readonly text: string;
}

/**
 * Source-agnostic port for LLM adapters.
 *
 * Any adapter (GitHub Copilot CLI, OpenAI API, Ollama, …) must implement
 * this interface so that the LLM client can send prompts and receive
 * responses without knowing the provider-specific details.
 */
export interface LlmPort {
  /**
   * Send a prompt to the LLM and return the raw text response.
   *
   * @param input - Structured prompt input with system/user prompts and optional parameters.
   * @returns A `Promise` that resolves with the LLM text response.
   */
  prompt(input: LlmPromptInput): Promise<LlmPromptResult>;
}
