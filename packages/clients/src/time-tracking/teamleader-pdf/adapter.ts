import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type TimeEntry,
  TimeEntrySchema,
  type TimeSheet,
  TimeSheetSchema,
} from "@isv/domain";

import type { TimeTrackingPort } from "../port.js";
import {
  classifyAttribution,
  extractTicketIds,
  parseDateToIso,
} from "../utils/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum duration (hours) to retain after L1 cleaning. */
const MIN_DURATION_HOURS = 0.1;

/** Date pattern: DD-MM-YYYY or MM/DD/YYYY */
const DATE_REGEX = /^\d{2}[-/]\d{2}[-/]\d{4}$/;

/** Duration pattern: HH:MM */
const HH_MM_REGEX = /^(\d+):(\d{2})$/;

/** Duration pattern: Xh Ym, Xh, Ym (Teamleader Arbeitsaufwand column) */
const HM_TEXT_REGEX = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/

/**
 * Header patterns used to detect the column header row in extracted text.
 * The adapter looks for these labels to determine column x-positions.
 */
const HEADER_LABELS: Record<string, (text: string) => boolean> = {
  datum: (t) => t === "Datum",
  dauer: (t) => t.startsWith("Dauer") || t === "Arbeitsaufwand",
  beschreibung: (t) => t === "Beschreibung",
};

// ---------------------------------------------------------------------------
// PDF text extraction (lazy-loaded)
// ---------------------------------------------------------------------------

interface TextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Extract all text items with their positions from a PDF file.
 * Concatenates items across all pages.
 */
async function extractTextItems(filePath: string): Promise<TextItem[]> {
  // Dynamic import to keep the pdfjs-dist dependency lazy
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Provide standard font data URL to suppress warnings
  const standardFontDataUrl = resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "node_modules",
    "pdfjs-dist",
    "standard_fonts",
  );

  const data = new Uint8Array(readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({
    data,
    standardFontDataUrl: standardFontDataUrl + "/",
    useSystemFonts: true,
  }).promise;

  const items: TextItem[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Page offset: for multi-page documents, shift y-coordinates so that
    // page 1 items have the highest y values and subsequent pages decrease.
    // This ensures rows are ordered top-to-bottom across pages.
    const pageOffset = (pageNum - 1) * -10000;

    for (const item of textContent.items) {
      // pdfjs TextItem has `str` (text) and `transform` (6-element matrix)
      // transform[4] = x, transform[5] = y
      const textItem = item as { str: string; transform: number[] };
      if (
        textItem.str !== undefined &&
        textItem.transform !== undefined &&
        textItem.str.trim() !== ""
      ) {
        items.push({
          str: textItem.str,
          x: textItem.transform[4],
          y: textItem.transform[5] + pageOffset,
        });
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Column detection from header row
// ---------------------------------------------------------------------------

interface ColumnBounds {
  datumX: number;
  dauerX: number;
  beschreibungX: number;
  /** End of beschreibung column (start of next column or page edge). */
  beschreibungEndX: number;
}

/**
 * Detect column x-positions from header text items.
 * Returns undefined if the header row cannot be found.
 */
function detectColumns(items: TextItem[]): ColumnBounds | undefined {
  let datumX: number | undefined;
  let dauerX: number | undefined;
  let beschreibungX: number | undefined;
  let beschreibungEndX: number | undefined;

  for (const item of items) {
    const text = item.str.trim();
    if (HEADER_LABELS.datum(text)) datumX = item.x;
    if (HEADER_LABELS.dauer(text)) dauerX = item.x;
    if (HEADER_LABELS.beschreibung(text)) {
      beschreibungX = item.x;
    }
  }

  if (datumX === undefined || beschreibungX === undefined) {
    return undefined;
  }

  // If Dauer/Arbeitsaufwand column is not found, it may not exist in this
  // variant. Set dauerX to a sentinel so callers know to look elsewhere.
  if (dauerX === undefined) {
    dauerX = -1;
  }

  // Find the next column after beschreibung by looking for header items
  // with x > beschreibungX. Common candidates: "Position", "Aufgabe", etc.
  const headerY = items.find(
    (i) => i.str.trim() === "Datum",
  )?.y;

  if (headerY !== undefined) {
    const headersAtY = items.filter(
      (i) => Math.abs(i.y - headerY) < 5 && i.x > beschreibungX!,
    );
    if (headersAtY.length > 0) {
      beschreibungEndX = Math.min(...headersAtY.map((i) => i.x));
    }
  }

  // Fallback: use a generous end bound
  beschreibungEndX ??= beschreibungX + 300;

  return { datumX, dauerX, beschreibungX, beschreibungEndX };
}

// ---------------------------------------------------------------------------
// Row extraction
// ---------------------------------------------------------------------------

interface RawRow {
  datum: string;
  dauer: string;
  beschreibung: string;
}

/**
 * Parse a duration string to decimal hours.
 * Supports both decimal format ("2.5") and HH:MM format ("02:30").
 */
export function parseDuration(value: string): number {
  const trimmed = value.trim();

  // HH:MM format
  const hhMmMatch = HH_MM_REGEX.exec(trimmed);
  if (hhMmMatch) {
    const hours = parseInt(hhMmMatch[1], 10);
    const minutes = parseInt(hhMmMatch[2], 10);
    return hours + minutes / 60;
  }

  // Xh Ym / Xh / Ym format (e.g. "3h 45m", "2h", "15m")
  const hmMatch = HM_TEXT_REGEX.exec(trimmed);
  if (hmMatch && (hmMatch[1] !== undefined || hmMatch[2] !== undefined)) {
    const hours = hmMatch[1] ? parseInt(hmMatch[1], 10) : 0;
    const minutes = hmMatch[2] ? parseInt(hmMatch[2], 10) : 0;
    return hours + minutes / 60;
  }

  // Decimal format
  const num = parseFloat(trimmed);
  return isFinite(num) ? num : NaN;
}

/**
 * Group text items into data rows based on detected column positions.
 *
 * Strategy:
 * 1. Find all items in the Datum column that match the date pattern.
 *    Each such item starts a new row.
 * 2. For each row, collect text items in the Dauer and Beschreibung
 *    column ranges that share the same y-band (within tolerance).
 * 3. Multi-line descriptions are joined with spaces.
 */
function extractRows(items: TextItem[], cols: ColumnBounds): RawRow[] {
  const TOLERANCE = 3; // x-tolerance for column assignment

  // Find the header row y-coordinate
  const headerItem = items.find((i) => i.str.trim() === "Datum");
  if (!headerItem) return [];
  const headerY = headerItem.y;

  // Filter to items below the header (y < headerY in PDF coords)
  const dataItems = items.filter((i) => i.y < headerY - 5);

  // Find all date items in the datum column
  const dateItems = dataItems
    .filter(
      (i) =>
        Math.abs(i.x - cols.datumX) < TOLERANCE + 10 &&
        DATE_REGEX.test(i.str.trim()),
    )
    .sort((a, b) => b.y - a.y); // top-to-bottom (descending y)

  if (dateItems.length === 0) return [];

  const rows: RawRow[] = [];

  for (let i = 0; i < dateItems.length; i++) {
    const dateItem = dateItems[i];
    const nextDateY =
      i + 1 < dateItems.length ? dateItems[i + 1].y : -Infinity;

    // Collect items in this row's y-band
    const rowItems = dataItems.filter(
      (item) => item.y <= dateItem.y + 2 && item.y > nextDateY,
    );

    // Extract duration: items in dauer/arbeitsaufwand column x-range
    let dauerItems: TextItem[];
    if (cols.dauerX > cols.beschreibungX) {
      // Arbeitsaufwand column is to the right of Beschreibung
      dauerItems = rowItems.filter(
        (item) => item.x >= cols.dauerX - TOLERANCE,
      );
    } else if (cols.dauerX >= 0) {
      // Dauer column is between Datum and Beschreibung
      dauerItems = rowItems.filter(
        (item) =>
          item.x >= cols.dauerX - TOLERANCE &&
          item.x < cols.beschreibungX - TOLERANCE,
      );
    } else {
      dauerItems = [];
    }
    const dauer =
      dauerItems
        .map((item) => item.str.trim())
        .filter((s) => s.length > 0)
        .join(" ") || "";

    // Extract description: items in beschreibung column x-range
    const beschreibungItems = rowItems
      .filter(
        (item) =>
          item.x >= cols.beschreibungX - TOLERANCE &&
          item.x < cols.beschreibungEndX - TOLERANCE,
      )
      .sort((a, b) => b.y - a.y); // top-to-bottom

    const beschreibung = beschreibungItems
      .map((item) => item.str.trim())
      .filter((s) => s.length > 0)
      .join(" ");

    // Skip summary/footer rows (e.g. "Total:")
    if (dateItem.str.trim().toLowerCase() === "total:") continue;

    rows.push({
      datum: dateItem.str.trim(),
      dauer,
      beschreibung,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Row → TimeEntry mapping
// ---------------------------------------------------------------------------

function rowToTimeEntry(row: RawRow): TimeEntry | null {
  const durationHours = parseDuration(row.dauer);

  if (!isFinite(durationHours) || durationHours < MIN_DURATION_HOURS) {
    return null; // L1 cleaning: filter out rounding artifacts
  }

  const timestamp = parseDateToIso(row.datum);
  const rawComment = row.beschreibung;
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

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Teamleader PDF adapter.
 *
 * Reads `.pdf` files exported from Teamleader Focus, extracts the time
 * tracking table using PDF text extraction, applies L1 cleaning, and
 * returns a validated `TimeSheet`.
 *
 * ## Parsing strategy
 *
 * 1. Extract all text items with their (x, y) positions from the PDF.
 * 2. Detect the column header row by matching known header labels.
 * 3. Use header x-positions to define column boundaries.
 * 4. Identify data rows by finding date patterns (DD-MM-YYYY) in the
 *    Datum column area.
 * 5. For each row, collect duration and description text items by
 *    x-coordinate range, handling multi-line text wrapping.
 * 6. Map to `TimeEntry` via shared helper functions.
 */
export class TeamleaderPdfAdapter implements TimeTrackingPort {
  async parse(filePath: string): Promise<TimeSheet> {
    const sourceFile = filePath.split(/[\\/]/).pop() ?? filePath;
    const items = await extractTextItems(filePath);

    const cols = detectColumns(items);
    if (!cols) {
      // No recognizable header found — return empty sheet
      const now = new Date().toISOString();
      return TimeSheetSchema.parse({
        periodStart: now,
        periodEnd: now,
        sourceSystem: "teamleader",
        sourceFile,
        rawEntryCount: 0,
        entries: [],
      });
    }

    const rawRows = extractRows(items, cols);
    const rawEntryCount = rawRows.length;
    const entries: TimeEntry[] = [];

    for (const row of rawRows) {
      const entry = rowToTimeEntry(row);
      if (entry !== null) {
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
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
