import { z } from "zod";

/**
 * Query schema for the `LlmClient.prompt()` method.
 *
 * Defines the structured input sent to the LLM: a system prompt providing
 * instructions and a user prompt providing the actual content. Optional
 * parameters control generation behaviour.
 */
export const LlmQuerySchema = z
  .object({
    systemPrompt: z
      .string()
      .min(1)
      .describe("System-level instruction for the LLM"),
    userPrompt: z
      .string()
      .min(1)
      .describe("User-level prompt content to send to the LLM"),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe(
        "Sampling temperature (0–2). Lower values produce more deterministic output.",
      ),
    maxTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum number of tokens to generate in the response"),
    cwd: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional working directory from which the CLI adapter executes, " +
          "allowing it to resolve relative paths within the repository.",
      ),
  })
  .describe(
    "Structured query for the LLM client. " +
      "Contains system and user prompts plus optional generation parameters.",
  );

export type LlmQuery = z.infer<typeof LlmQuerySchema>;
