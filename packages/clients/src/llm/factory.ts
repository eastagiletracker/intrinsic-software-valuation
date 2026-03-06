import type { Result } from "@isv/domain";

import type { LlmClient } from "./client.js";
import type { LlmClientConfig } from "./client-config.schema.js";
import { GithubCopilotCliAdapter } from "./github-copilot-cli/index.js";
import type { LlmPort } from "./port.js";
import type { LlmQuery } from "./query.schema.js";

// ---------------------------------------------------------------------------
// Adapter resolution
// ---------------------------------------------------------------------------

function resolveAdapter(config: LlmClientConfig): LlmPort {
  switch (config.provider) {
    case "github-copilot-cli":
      return new GithubCopilotCliAdapter({
        timeoutMs: config.timeoutMs,
        stallTimeoutMs: config.stallTimeoutMs,
        cwd: config.cwd,
      });
    default:
      throw new Error(
        `Unknown LLM provider: "${config.provider as string}". ` +
          'Supported providers: "github-copilot-cli".',
      );
  }
}

// ---------------------------------------------------------------------------
// DefaultLlmClient
// ---------------------------------------------------------------------------

/**
 * Default implementation of `LlmClient`.
 *
 * Delegates prompt invocations to the resolved adapter and maps errors
 * to the standard `Result` / `ServiceError` shape.
 */
class DefaultLlmClient implements LlmClient {
  private readonly adapter: LlmPort;

  constructor(adapter: LlmPort) {
    this.adapter = adapter;
  }

  async prompt(query: LlmQuery & { signal?: AbortSignal }): Promise<Result<string>> {
    try {
      const result = await this.adapter.prompt({
        systemPrompt: query.systemPrompt,
        userPrompt: query.userPrompt,
        temperature: query.temperature,
        maxTokens: query.maxTokens,
        cwd: query.cwd,
        signal: query.signal,
      });

      return { success: true, data: result.text };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "LLM_PROMPT_FAILED",
          message: err instanceof Error ? err.message : String(err),
          source: "llm-client",
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ready-to-use `LlmClient` from configuration.
 *
 * The factory resolves the correct adapter based on `provider` and returns
 * a client instance that can be used to send prompts to the LLM.
 *
 * @param config - Configuration specifying the LLM provider and optional settings.
 * @returns An initialised `LlmClient`.
 */
export function createLlmClient(config: LlmClientConfig): LlmClient {
  const adapter = resolveAdapter(config);
  return new DefaultLlmClient(adapter);
}
