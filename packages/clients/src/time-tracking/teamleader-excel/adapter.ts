import {
  type AttributionType,
  type TimeEntry,
  TimeEntrySchema,
  type TimeSheet,
  TimeSheetSchema,
} from "@isv/domain";
import ExcelJS from "exceljs";

import type { TimeTrackingPort } from "../port.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum duration (hours) to retain after L1 cleaning. */
const MIN_DURATION_HOURS = 0.1;

/** Threshold: more than this many IDs → UNLINKED_OVERHEAD. */
const MULTI_ID_MAX = 3;

/** Default regex for detecting Jira-style ticket IDs in free text. */
const DEFAULT_TICKET_ID_REGEX = /[A-Z]+-\d+/g;

/** Regex for Jira browse URLs — captures the ticket ID from the path. */
const JIRA_URL_REGEX =
  /https?:\/\/[^/\s]+\/browse\/([A-Z]+-\d+)/g;

// ---------------------------------------------------------------------------
// Column mapping (Teamleader export format)
// ---------------------------------------------------------------------------

/** Zero-based column indices for the Teamleader Excel export header row. */
interface ColumnIndex {
  projekt: number;
  datum: number;
  dauer: number;
  beschreibung: number;
  position: number;
  aufgabe: number;
}

const EXPECTED_HEADERS: Record<keyof ColumnIndex, string> = {
  projekt: "Projekt",
  datum: "Datum",
  dauer: "Dauer (Stunden)",
  beschreibung: "Beschreibung",
  position: "Position",
  aufgabe: "Aufgabe",
};

// ---------------------------------------------------------------------------
// Pure helper functions (each step of the pipeline)
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

// ---------------------------------------------------------------------------
// Column discovery
// ---------------------------------------------------------------------------

function buildColumnIndex(headerRow: ExcelJS.Row): ColumnIndex {
  const index: Partial<ColumnIndex> = {};

  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? "").trim();
    for (const [key, expected] of Object.entries(EXPECTED_HEADERS) as Array<
      [keyof ColumnIndex, string]
    >) {
      if (text === expected) {
        index[key] = colNumber - 1; // convert to 0-based
      }
    }
  });

  for (const key of Object.keys(EXPECTED_HEADERS) as Array<keyof ColumnIndex>) {
    if (index[key] === undefined) {
      throw new Error(
        `Teamleader Excel adapter: missing expected column "${EXPECTED_HEADERS[key]}"`,
      );
    }
  }

  return index as ColumnIndex;
}

// ---------------------------------------------------------------------------
// Row → TimeEntry mapping
// ---------------------------------------------------------------------------

function rowToTimeEntry(
  row: ExcelJS.Row,
  cols: ColumnIndex,
): TimeEntry | null {
  const values = row.values as ExcelJS.CellValue[];

  const rawDuration = values[cols.dauer + 1]; // row.values is 1-based
  const durationHours =
    typeof rawDuration === "number"
      ? rawDuration
      : parseFloat(String(rawDuration ?? ""));

  if (!isFinite(durationHours) || durationHours < MIN_DURATION_HOURS) {
    return null; // L1 cleaning: filter out rounding artifacts
  }

  const rawDate = values[cols.datum + 1];
  const timestamp = parseDateToIso(rawDate);

  const rawComment = String(values[cols.beschreibung + 1] ?? "").trim();
  const detectedIds = extractTicketIds(rawComment);
  const attributionType = classifyAttribution(detectedIds.length);

  const entry = TimeEntrySchema.parse({
    timestamp,
    durationHours,
    rawComment,
    detectedIds,
    attributionType,
  });

  return entry;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Teamleader Excel adapter.
 *
 * Reads `.xlsx` files exported from Teamleader, maps columns to `TimeEntry`,
 * applies L1 cleaning, and returns a validated `TimeSheet`.
 *
 * Streaming row iteration via ExcelJS keeps memory usage constant even for
 * files with 2,000+ rows.
 */
export class TeamleaderExcelAdapter implements TimeTrackingPort {
  /**
   * Parse the Teamleader `.xlsx` file at `filePath` and return a `TimeSheet`.
   */
  async parse(filePath: string): Promise<TimeSheet> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {});
    const sourceFile = filePath.split(/[\\/]/).pop() ?? filePath;

    const entries: TimeEntry[] = [];
    let rawEntryCount = 0;
    let cols: ColumnIndex | undefined;
    let headerRowIndex = -1;

    for await (const worksheet of workbook) {
      let rowIndex = 0;

      for await (const row of worksheet) {
        // row 0 (rowIndex 0) is the metadata row ("Export …"); skip it.
        // row 1 (rowIndex 1) is the header row.
        if (rowIndex === 0) {
          rowIndex++;
          continue;
        }
        if (rowIndex === 1) {
          headerRowIndex = rowIndex;
          cols = buildColumnIndex(row);
          rowIndex++;
          continue;
        }

        if (!cols) break;
        if (headerRowIndex < 0) break;

        // Skip visually empty rows
        const allEmpty = (row.values as ExcelJS.CellValue[])
          .slice(1)
          .every((v) => v === null || v === undefined || v === "");
        if (allEmpty) {
          rowIndex++;
          continue;
        }

        rawEntryCount++;
        const entry = rowToTimeEntry(row, cols);
        if (entry !== null) {
          entries.push(entry);
        }
        rowIndex++;
      }
    }

    if (entries.length === 0) {
      // Edge case: file had no usable data rows
      const now = new Date().toISOString();
      return TimeSheetSchema.parse({
        periodStart: now,
        periodEnd: now,
        sourceSystem: "teamleader",
        sourceFile,
        rawEntryCount,
        entries: [],
      });
    }

    const timestamps = entries.map((e) => new Date(e.timestamp).getTime());
    const periodStart = new Date(Math.min(...timestamps)).toISOString();
    const periodEnd = new Date(Math.max(...timestamps)).toISOString();

    return TimeSheetSchema.parse({
      periodStart,
      periodEnd,
      sourceSystem: "teamleader",
      sourceFile,
      rawEntryCount,
      entries,
    });
  }
}
