import { z } from "zod";

import { LlmProviderSchema } from "./provider.schema.js";

/**
 * Configuration for initialising an `LlmClient`.
 *
 * Provides the provider selection and optional provider-specific settings
 * the factory needs to resolve the correct adapter.
 */
export const LlmClientConfigSchema = z
  .object({
    provider: LlmProviderSchema.describe(
      "LLM provider identifier that determines which adapter is used",
    ),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Timeout in milliseconds for LLM invocations. " +
          "Defaults to 120 000 (2 minutes) if not specified.",
      ),
    stallTimeoutMs: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Stall detection timeout in milliseconds. If the LLM process " +
          "produces no output for this duration it is killed early. " +
          "Defaults to 60 000 (1 minute). Set to 0 to disable.",
      ),
    cwd: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Default working directory for CLI-based adapters. " +
          "Can be overridden per-query.",
      ),
  })
  .describe("Configuration for the LLM client factory.");

export type LlmClientConfig = z.infer<typeof LlmClientConfigSchema>;
