import { z } from "zod";

/**
 * Supported LLM provider identifiers.
 *
 * Each value maps to a concrete adapter that the factory resolves
 * when creating an `LlmClient`.
 */
export const LlmProviderSchema = z
  .enum(["github-copilot-cli"])
  .describe(
    "LLM provider identifier. " +
      "Determines which adapter the factory instantiates.",
  );

export type LlmProvider = z.infer<typeof LlmProviderSchema>;
