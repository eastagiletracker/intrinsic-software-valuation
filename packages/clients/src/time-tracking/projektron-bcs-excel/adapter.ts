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
const JIRA_URL_REGEX = /https?:\/\/[^/\s]+\/browse\/([A-Z]+-\d+)/g;

/**
 * Header row marker: the Projektron BCS export uses a header row
 * containing these column labels (in order).
 */
const HEADER_LABELS = ["Name", "Datum", "Vorgang", "Aufwand"];

/**
 * Labels that appear in summary or footer rows. These rows are skipped
 * during data extraction.
 */
const SKIP_LABELS = [
  "Summe:",
  "Fakturiert:",
  "Gesamtsumme:",
  "Gesamt Fakturiert:",
  "Freigabevermerk",
  "Bemerkung",
  "Stammdaten",
];

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Parse a date value from the Projektron BCS Excel export.
 * Values are typically JavaScript Date objects.
 */
export function parseDateToIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
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

  // First pass: extract IDs from Jira browse URLs
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
 * Classify attribution type based on the number of detected ticket IDs.
 */
export function classifyAttribution(idCount: number): AttributionType {
  if (idCount === 0) return "KBV";
  if (idCount === 1) return "DIRECT";
  if (idCount <= MULTI_ID_MAX) return "MULTI_ID_SPLIT";
  return "UNLINKED_OVERHEAD";
}

/**
 * Extract plain text from a cell value that may be a rich-text object.
 */
export function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "richText" in value) {
    return (value as { richText: Array<{ text: string }> }).richText
      .map((part) => part.text)
      .join("");
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// ---------------------------------------------------------------------------
// Row classification helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether a row is the column header row
 * (contains "Name", "Datum", "Vorgang", "Aufwand").
 */
function isHeaderRow(row: ExcelJS.Row, colCount: number): boolean {
  const texts: string[] = [];
  for (let c = 1; c <= colCount; c++) {
    texts.push(cellToString(row.getCell(c).value).trim());
  }
  return HEADER_LABELS.every((label) => texts.includes(label));
}

/**
 * Detect whether a row is a person-section header.
 * Person headers have a rich-text value in column A and the name is
 * repeated across all columns.
 */
function isPersonHeaderRow(row: ExcelJS.Row): boolean {
  const cellA = row.getCell(1).value;
  if (cellA == null) return false;
  // Rich-text person name or plain "Lastname, Firstname"
  const text = cellToString(cellA).trim();
  if (text === "" || SKIP_LABELS.some((l) => text.startsWith(l))) return false;
  // Heuristic: person rows have rich-text in cell A AND no date in cell B
  const cellB = row.getCell(2).value;
  if (cellB instanceof Date) return false;
  const bText = cellToString(cellB).trim();
  // Person headers repeat the name in all columns
  return bText === text || (typeof cellA === "object" && cellA !== null && "richText" in cellA);
}

/**
 * Detect whether a row is a summary/footer row that should be skipped.
 */
function isSummaryOrFooterRow(row: ExcelJS.Row, colCount: number): boolean {
  for (let c = 1; c <= colCount; c++) {
    const text = cellToString(row.getCell(c).value).trim();
    if (SKIP_LABELS.some((l) => text.startsWith(l))) return true;
  }
  return false;
}

/**
 * Detect whether a row is a data row (has a date in column B and numeric
 * duration in column D).
 */
function isDataRow(
  row: ExcelJS.Row,
  datumCol: number,
  aufwandCol: number,
): boolean {
  const dateVal = row.getCell(datumCol).value;
  const durVal = row.getCell(aufwandCol).value;
  if (dateVal == null || durVal == null) return false;
  const hasDate = dateVal instanceof Date || !isNaN(new Date(String(dateVal)).getTime());
  const hasNumber = typeof durVal === "number" || !isNaN(parseFloat(String(durVal)));
  return hasDate && hasNumber;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Projektron BCS Excel adapter.
 *
 * Reads `.xlsx` files exported from Projektron BCS ("Nachweis gebuchter
 * Aufwand für Rechnung"), extracts time entries from the paired data/comment
 * row structure, applies L1 cleaning, and returns a validated `TimeSheet`.
 *
 * ## File structure
 *
 * - Rows 1–7: Metadata (title, report period, project, invoice)
 * - Row 8: Column headers: Name | Datum | Vorgang | Aufwand | (unit) | (flags)
 * - Row 9+: Person sections, each starting with a person-name header row
 * - Data rows come in pairs:
 *   - **Data row**: `["", Date, "Task", hours, "h", " "]`
 *   - **Comment row**: `["", "", "description / ticket IDs", "", "", ""]`
 * - Person sections end with a "Summe:" summary row
 * - File ends with "Gesamtsumme:" and a footer ("Freigabevermerk")
 */
export class ProjektronBcsExcelAdapter implements TimeTrackingPort {
  async parse(filePath: string): Promise<TimeSheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sourceFile = filePath.split(/[\\/]/).pop() ?? filePath;

    const entries: TimeEntry[] = [];
    let rawEntryCount = 0;

    for (const worksheet of workbook.worksheets) {
      const colCount = worksheet.columnCount;
      let headerFound = false;
      // Column positions (1-based) — detected from header row
      let datumCol = 2;
      let vorgangCol = 3;
      let aufwandCol = 4;

      let pendingDate: string | null = null;
      let pendingDuration: number | null = null;

      for (let rowIdx = 1; rowIdx <= worksheet.rowCount; rowIdx++) {
        const row = worksheet.getRow(rowIdx);

        // Detect header row
        if (!headerFound) {
          if (isHeaderRow(row, colCount)) {
            // Resolve column positions from header
            let aufwandFound = false;
            for (let c = 1; c <= colCount; c++) {
              const text = cellToString(row.getCell(c).value).trim();
              if (text === "Datum") datumCol = c;
              else if (text === "Vorgang") vorgangCol = c;
              else if (text === "Aufwand" && !aufwandFound) {
                aufwandCol = c;
                aufwandFound = true;
              }
            }
            headerFound = true;
          }
          continue;
        }

        // Skip person-section headers
        if (isPersonHeaderRow(row)) {
          // Flush any pending data row without a comment
          if (pendingDate !== null && pendingDuration !== null) {
            rawEntryCount++;
            const entry = buildEntry(pendingDate, pendingDuration, "");
            if (entry) entries.push(entry);
            pendingDate = null;
            pendingDuration = null;
          }
          continue;
        }

        // Skip summary/footer rows
        if (isSummaryOrFooterRow(row, colCount)) {
          // Flush pending
          if (pendingDate !== null && pendingDuration !== null) {
            rawEntryCount++;
            const entry = buildEntry(pendingDate, pendingDuration, "");
            if (entry) entries.push(entry);
            pendingDate = null;
            pendingDuration = null;
          }
          continue;
        }

        // Skip fully empty rows
        const allEmpty = (row.values as ExcelJS.CellValue[])
          .slice(1)
          .every((v) => v == null || String(v).trim() === "");
        if (allEmpty) {
          // Flush pending
          if (pendingDate !== null && pendingDuration !== null) {
            rawEntryCount++;
            const entry = buildEntry(pendingDate, pendingDuration, "");
            if (entry) entries.push(entry);
            pendingDate = null;
            pendingDuration = null;
          }
          continue;
        }

        // Check if this is a data row (has date + duration)
        if (isDataRow(row, datumCol, aufwandCol)) {
          // If there's a pending data row, flush it (comment-less entry)
          if (pendingDate !== null && pendingDuration !== null) {
            rawEntryCount++;
            const entry = buildEntry(pendingDate, pendingDuration, "");
            if (entry) entries.push(entry);
          }

          // Parse the data row
          const rawDate = row.getCell(datumCol).value;
          const rawDuration = row.getCell(aufwandCol).value;
          const durationHours =
            typeof rawDuration === "number"
              ? rawDuration
              : parseFloat(String(rawDuration ?? ""));

          try {
            pendingDate = parseDateToIso(rawDate);
            pendingDuration = isFinite(durationHours) ? durationHours : null;
          } catch {
            pendingDate = null;
            pendingDuration = null;
          }
          continue;
        }

        // This must be a comment row (follows a data row)
        if (pendingDate !== null && pendingDuration !== null) {
          const rawComment = cellToString(row.getCell(vorgangCol).value).trim();
          rawEntryCount++;
          const entry = buildEntry(pendingDate, pendingDuration, rawComment);
          if (entry) entries.push(entry);
          pendingDate = null;
          pendingDuration = null;
        }
      }

      // Flush any trailing pending entry
      if (pendingDate !== null && pendingDuration !== null) {
        rawEntryCount++;
        const entry = buildEntry(pendingDate, pendingDuration, "");
        if (entry) entries.push(entry);
      }
    }

    if (entries.length === 0) {
      const now = new Date().toISOString();
      return TimeSheetSchema.parse({
        periodStart: now,
        periodEnd: now,
        sourceSystem: "projektron-bcs",
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
      sourceSystem: "projektron-bcs",
      sourceFile,
      rawEntryCount,
      entries,
    });
  }
}

// ---------------------------------------------------------------------------
// Entry builder
// ---------------------------------------------------------------------------

function buildEntry(
  timestamp: string,
  durationHours: number,
  rawComment: string,
): TimeEntry | null {
  if (!isFinite(durationHours) || durationHours < MIN_DURATION_HOURS) {
    return null; // L1 cleaning
  }

  const detectedIds = extractTicketIds(rawComment);
  const attributionType = classifyAttribution(detectedIds.length);

  return TimeEntrySchema.parse({
    timestamp,
    durationHours,
    rawComment,
    detectedIds,
    attributionType,
  });
}
