import { z } from "zod";

/**
 * Unique identifier for a ticket in an issue tracking system.
 *
 * Tool-agnostic: supports Jira (PROJ-123), Azure DevOps work items,
 * Linear issues, GitHub Issues, and other systems.
 * No format restriction beyond non-empty string to stay system-independent.
 */
export const TicketIdSchema = z
  .string()
  .min(1)
  .describe(
    'Unique ticket identifier from the issue tracking system, e.g. "PROJ-123". ' +
      "No format restriction — supports any ticket system.",
  );

export type TicketId = z.infer<typeof TicketIdSchema>;
