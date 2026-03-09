import {
  type TimeEntry,
  TimeEntrySchema,
  type TimeSheet,
  TimeSheetSchema,
} from "@isv/domain";
import ExcelJS from "exceljs";

import type { TimeTrackingPort } from "../port.js";
import {
  classifyAttribution,
  extractTicketIds,
  parseDateToIso,
} from "../utils/index.js";

// Re-export shared helpers for backward compatibility
export { classifyAttribution, extractTicketIds, parseDateToIso };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum duration (hours) to retain after L1 cleaning. */
const MIN_DURATION_HOURS = 0.1;

// ---------------------------------------------------------------------------
// Column mapping (Teamleader export format)
// ---------------------------------------------------------------------------

/** Zero-based column indices for the Teamleader Excel export header row. */
interface ColumnIndex {
  /** Required */
  datum: number;
  dauer: number;
  beschreibung: number;
  /** Optional – present in some export variants */
  projekt?: number;
  position?: number;
  aufgabe?: number;
  ticketId?: number;
  /** true when Dauer header does NOT contain "Stunden" → values are minutes */
  dauerInMinutes: boolean;
}

/** Required columns — header detection succeeds only when all are found. */
const REQUIRED_HEADER_PATTERNS: Record<
  "datum" | "dauer" | "beschreibung",
  (text: string) => boolean
> = {
  datum: (t) => t === "Datum",
  dauer: (t) => t.startsWith("Dauer"),
  beschreibung: (t) => t === "Beschreibung",
};

/** Optional columns — matched if present but not required. */
const OPTIONAL_HEADER_PATTERNS: Record<
  "projekt" | "position" | "aufgabe" | "ticketId",
  (text: string) => boolean
> = {
  projekt: (t) => t === "Projekt" || t === "Projektname",
  position: (t) => t === "Position",
  aufgabe: (t) => t === "Aufgabe",
  ticketId: (t) => t === "Ticket-ID",
};

// ---------------------------------------------------------------------------
// Column discovery
// ---------------------------------------------------------------------------

/**
 * Try to build a column index from a row. Returns `undefined` if the row does
 * not contain all required header columns (Datum, Dauer, Beschreibung).
 * Optional columns (Projekt/Projektname, Position, Aufgabe, Ticket-ID) are
 * captured when present.
 */
function tryBuildColumnIndex(row: ExcelJS.Row): ColumnIndex | undefined {
  const required: Partial<Record<"datum" | "dauer" | "beschreibung", number>> =
    {};
  const optional: Partial<
    Record<"projekt" | "position" | "aufgabe" | "ticketId", number>
  > = {};
  let dauerHeaderText = "";

  row.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? "").trim();
    for (const [key, matches] of Object.entries(REQUIRED_HEADER_PATTERNS) as Array<
      ["datum" | "dauer" | "beschreibung", (text: string) => boolean]
    >) {
      if (matches(text)) {
        required[key] = colNumber - 1;
        if (key === "dauer") dauerHeaderText = text;
      }
    }
    for (const [key, matches] of Object.entries(OPTIONAL_HEADER_PATTERNS) as Array<
      ["projekt" | "position" | "aufgabe" | "ticketId", (text: string) => boolean]
    >) {
      if (matches(text)) {
        optional[key] = colNumber - 1;
      }
    }
  });

  // All required columns must be present
  for (const key of Object.keys(REQUIRED_HEADER_PATTERNS) as Array<
    "datum" | "dauer" | "beschreibung"
  >) {
    if (required[key] === undefined) return undefined;
  }

  // "Dauer (Stunden)" → hours; bare "Dauer" or other variants → minutes
  const dauerInMinutes = !dauerHeaderText
    .toLowerCase()
    .includes("stunden");

  return {
    datum: required.datum!,
    dauer: required.dauer!,
    beschreibung: required.beschreibung!,
    ...optional,
    dauerInMinutes,
  };
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
  let durationHours =
    typeof rawDuration === "number"
      ? rawDuration
      : parseFloat(String(rawDuration ?? ""));

  if (cols.dauerInMinutes) {
    durationHours = durationHours / 60;
  }

  if (!isFinite(durationHours) || durationHours < MIN_DURATION_HOURS) {
    return null; // L1 cleaning: filter out rounding artifacts
  }

  const rawDate = values[cols.datum + 1];
  const timestamp = parseDateToIso(rawDate);

  const rawComment = String(values[cols.beschreibung + 1] ?? "").trim();

  // Collect ticket IDs from description text
  const detectedIds = extractTicketIds(rawComment);

  // If a dedicated Ticket-ID column exists, merge its value in
  if (cols.ticketId !== undefined) {
    const rawTicketId = String(values[cols.ticketId + 1] ?? "").trim();
    if (rawTicketId) {
      for (const id of extractTicketIds(rawTicketId)) {
        if (!detectedIds.includes(id)) {
          detectedIds.push(id);
        }
      }
    }
  }

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
 */
export class TeamleaderExcelAdapter implements TimeTrackingPort {
  /**
   * Parse the Teamleader `.xlsx` file at `filePath` and return a `TimeSheet`.
   */
  async parse(filePath: string): Promise<TimeSheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sourceFile = filePath.split(/[\\/]/).pop() ?? filePath;

    const entries: TimeEntry[] = [];
    let rawEntryCount = 0;
    let cols: ColumnIndex | undefined;

    for (const worksheet of workbook.worksheets) {
      for (let rowIdx = 1; rowIdx <= worksheet.rowCount; rowIdx++) {
        const row = worksheet.getRow(rowIdx);

        // Auto-detect the header row by probing each row until all expected
        // columns are found. This handles files with or without a leading
        // metadata row.
        if (!cols) {
          cols = tryBuildColumnIndex(row);
          continue; // skip the header row (or metadata row) itself
        }

        // Skip visually empty rows
        const allEmpty = (row.values as ExcelJS.CellValue[])
          .slice(1)
          .every((v) => v === null || v === undefined || v === "");
        if (allEmpty) {
          continue;
        }

        rawEntryCount++;
        const entry = rowToTimeEntry(row, cols);
        if (entry !== null) {
          entries.push(entry);
        }
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
