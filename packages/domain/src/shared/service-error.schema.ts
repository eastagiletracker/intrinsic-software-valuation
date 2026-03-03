import { z } from "zod";

/**
 * Structured error returned by services and clients.
 *
 * Provides machine-readable error codes for pipeline control flow
 * (e.g. abort, retry, flag for review) and human-readable messages for debugging.
 *
 * Every service and client in the ISV Engine returns this error shape
 * when an operation fails, ensuring consistent error handling across layers.
 */
export const ServiceErrorSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .describe(
        "Machine-readable error code for programmatic handling, " +
          'e.g. "TICKET_NOT_ACTIONABLE", "LLM_TIMEOUT", "JIRA_AUTH_FAILED"',
      ),
    message: z
      .string()
      .describe("Human-readable error description for logging and debugging"),
    source: z
      .string()
      .min(1)
      .describe(
        "Component that produced the error, " +
          'e.g. "gap-analyzer", "jira-client", "llm-client"',
      ),
    context: z
      .unknown()
      .optional()
      .describe(
        "Optional structured data for debugging: request IDs, partial responses, " +
          "upstream error details, etc.",
      ),
  })
  .describe(
    "Structured service error with code, message, source component, and optional debug context. " +
      "Used as the error branch of the Result discriminated union.",
  );

export type ServiceError = z.infer<typeof ServiceErrorSchema>;
