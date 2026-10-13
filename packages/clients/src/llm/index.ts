// LLM client — port (stable interface) and adapter implementations.
export type { LlmPort, LlmPromptInput, LlmPromptResult } from "./port.js";
export {
  GithubCopilotCliAdapter,
  isLlmStallError,
  LLM_STALL_CODE,
} from "./github-copilot-cli/index.js";

// High-level client, schemas, and factory.
export type { LlmClient } from "./client.js";
export { LlmProviderSchema, type LlmProvider } from "./provider.schema.js";
export {
  LlmClientConfigSchema,
  type LlmClientConfig,
} from "./client-config.schema.js";
export { LlmQuerySchema, type LlmQuery } from "./query.schema.js";
export { createLlmClient } from "./factory.js";
export { retryOnLlmStall } from "./stall-retry.js";
