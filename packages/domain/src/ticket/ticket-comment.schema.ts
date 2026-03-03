import { z } from "zod";

import { IsoTimestampSchema } from "../shared/iso-timestamp.schema.js";

/**
 * Comment on a ticket from the issue tracking system.
 *
 * Comments often contain clarifications, design decisions, or scope changes
 * that are not reflected in the ticket description. The Gap Analyzer reads
 * comments as additional context for architectural analysis.
 */
export const TicketCommentSchema = z
  .object({
    author: z
      .string()
      .min(1)
      .describe("Display name or user ID of the comment author"),
    body: z.string().describe("Full text content of the comment"),
    createdAt: IsoTimestampSchema.describe(
      "Timestamp when the comment was created",
    ),
  })
  .describe(
    "A single comment on a ticket, ordered chronologically. " +
      "Provides additional context beyond the ticket description for AI analysis.",
  );

export type TicketComment = z.infer<typeof TicketCommentSchema>;
