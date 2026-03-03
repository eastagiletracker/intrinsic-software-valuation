import { z } from "zod";

/**
 * Attribution type for a time tracking entry.
 *
 * Describes how the entry was matched to ticket(s) during parsing.
 * The attribution strategy follows the prioritization rules from the
 * Historical Calibration concept:
 *
 * 1. DIRECT — exactly one known ticket ID in comment → full attribution
 * 2. CLUSTER_MATCH — subtask ID maps to parent cluster automatically
 * 3. MULTI_ID_SPLIT — multiple IDs from different clusters → hours split evenly
 * 4. UNLINKED_OVERHEAD — more than 3 IDs, or regex match without Jira existence
 * 5. KBV — no recognizable IDs → Knowledge-Based Value (meetings, admin, research)
 */
export const AttributionTypeSchema = z
  .enum([
    "DIRECT",
    "CLUSTER_MATCH",
    "MULTI_ID_SPLIT",
    "UNLINKED_OVERHEAD",
    "KBV",
  ])
  .describe(
    "How this time entry was attributed to ticket(s): " +
      "DIRECT: single ID match, " +
      "CLUSTER_MATCH: subtask mapped to parent, " +
      "MULTI_ID_SPLIT: multiple IDs split evenly, " +
      "UNLINKED_OVERHEAD: too many IDs or invalid match, " +
      "KBV: no IDs detected (Knowledge-Based Value)",
  );

export type AttributionType = z.infer<typeof AttributionTypeSchema>;
