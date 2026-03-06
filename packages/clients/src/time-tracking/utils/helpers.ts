import type { AttributionType } from "@isv/domain";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold: more than this many IDs → UNLINKED_OVERHEAD. */
const MULTI_ID_MAX = 3;

/** Default regex for detecting Jira-style ticket IDs in free text. */
const DEFAULT_TICKET_ID_REGEX = /[A-Z]+-\d+/g;

/** Regex for Jira browse URLs — captures the ticket ID from the path. */
const JIRA_URL_REGEX = /https?:\/\/[^/\s]+\/browse\/([A-Z]+-\d+)/g;

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Parse the Teamleader date format `DD-MM-YYYY` to an ISO 8601 string.
 * Falls back to `new Date(value).toISOString()` for other recognisable formats.
 */
export function parseDateToIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    // Teamleader format: DD-MM-YYYY
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
    if (match) {
      const [, dd, mm, yyyy] = match;
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`).toISOString();
    }
    // Teamleader "Project Report" format: DD/MM/YYYY
    const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (slashMatch) {
      const [, dd, mm, yyyy] = slashMatch;
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`).toISOString();
    }
    // Fallback
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof value === "number") {
    // Excel serial date (days since 1900-01-01, with the 1900 leap-year bug)
    const d = new Date((value - 25569) * 86400 * 1000);
    return d.toISOString();
  }
  throw new Error(`Cannot parse date value: ${String(value)}`);
}

/**
 * Extract all unique Jira-style ticket IDs from a description string.
 * Resolves both plain IDs and Jira browse URLs; deduplicates results.
 */
export function extractTicketIds(
  description: string,
  ticketIdRegex: RegExp = DEFAULT_TICKET_ID_REGEX,
): string[] {
  const ids = new Set<string>();

  // First pass: extract IDs from Jira browse URLs so the URL path segment
  // is not double-counted by the plain-ID regex.
  const urlRegex = new RegExp(JIRA_URL_REGEX.source, "g");
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(description)) !== null) {
    ids.add(m[1]);
  }

  // Second pass: extract plain ticket IDs
  const idRegex = new RegExp(ticketIdRegex.source, "g");
  while ((m = idRegex.exec(description)) !== null) {
    ids.add(m[0]);
  }

  return Array.from(ids);
}

/**
 * Classify the attribution type based on the number of detected ticket IDs.
 *
 * Rules (from concept doc):
 *  - 0 IDs → KBV
 *  - 1 ID  → DIRECT
 *  - 2–3 IDs → MULTI_ID_SPLIT
 *  - > 3 IDs → UNLINKED_OVERHEAD
 */
export function classifyAttribution(idCount: number): AttributionType {
  if (idCount === 0) return "KBV";
  if (idCount === 1) return "DIRECT";
  if (idCount <= MULTI_ID_MAX) return "MULTI_ID_SPLIT";
  return "UNLINKED_OVERHEAD";
}
