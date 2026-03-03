import { z } from "zod";

import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";
import { TicketIdSchema } from "../shared/ticket-id.schema.js";
import { TicketCommentSchema } from "./ticket-comment.schema.js";

/**
 * Normalized ticket representation from an issue tracking system.
 *
 * This schema is intentionally tool-agnostic — it supports Jira, Azure DevOps,
 * Linear, GitHub Issues, and other systems. No Jira-specific fields are included.
 *
 * The ticket is the primary input for the Gap Analyzer (phase 2) and is also
 * used for cluster aggregation in Historical Calibration (phase 3).
 *
 * Acceptance criteria are part of the description field — there is no separate
 * field because not all ticket systems distinguish them structurally.
 *
 * The ticket is always flat: parent/child relationships are expressed via
 * `parentId`, not via nesting. Cluster aggregation (grouping a story with its
 * subtasks) is the responsibility of the calibration service, not the schema.
 */
export const TicketSchema = z
  .object({
    ticketId: TicketIdSchema.describe(
      "Unique identifier from the ticket system, e.g. 'PROJ-123'",
    ),
    projectKey: z
      .string()
      .min(1)
      .describe(
        "Project identifier from the ticket system, e.g. 'PROJ'. " +
          "Used for filtering and scoping during calibration batch runs.",
      ),
    type: z
      .string()
      .min(1)
      .describe(
        "Issue type as reported by the ticket system, e.g. 'Story', 'Task', 'Bug', 'Subtask'. " +
          "Free-form string because issue types are configurable per project.",
      ),
    status: z
      .string()
      .min(1)
      .describe(
        "Current workflow status, e.g. 'Ready for Refinement', 'In Progress', 'Done'. " +
          "Free-form string because workflows are configurable per project.",
      ),
    title: z
      .string()
      .min(1)
      .describe("Ticket summary / title as shown in the ticket system"),
    description: z
      .string()
      .describe(
        "Full ticket description including acceptance criteria, requirements, " +
          "and any structured content. This is the primary text the Gap Analyzer reads.",
      ),
    parentId: TicketIdSchema.optional().describe(
      "ID of the parent ticket if this is a subtask. " +
        "Used for hierarchical cluster aggregation in calibration. " +
        "Null or absent for top-level stories/tasks.",
    ),
    storyPoints: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Story point estimate if available. Not always populated. " +
          "Used as reference data in calibration, not as ISV input.",
      ),
    labels: z
      .array(z.string())
      .describe(
        "Labels or tags attached to the ticket, e.g. ['frontend', 'refactoring']",
      ),
    comments: z
      .array(TicketCommentSchema)
      .describe(
        "Chronologically ordered comments on the ticket. " +
          "May contain clarifications and design decisions relevant for gap analysis.",
      ),
    createdAt: IsoTimestampSchema.describe(
      "Timestamp when the ticket was created in the ticket system",
    ),
    updatedAt: IsoTimestampSchema.describe(
      "Timestamp of the last update to the ticket",
    ),
  })
  .describe(
    "Normalized, tool-agnostic ticket from an issue tracking system. " +
      "Primary input for the Gap Analyzer and used in calibration clustering. " +
      "Flat structure — subtask hierarchy expressed via parentId, not nesting.",
  );

export type Ticket = z.infer<typeof TicketSchema>;
