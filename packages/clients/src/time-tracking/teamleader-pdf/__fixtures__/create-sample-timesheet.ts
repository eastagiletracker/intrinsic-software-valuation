/**
 * Fixture generator for the Teamleader PDF adapter.
 *
 * Creates a sanitized `.pdf` file that mirrors the structure of a real
 * Teamleader Focus project time-tracking PDF export.
 *
 * ## Provenance
 *
 * Structure derived from real Teamleader PDF exports (e.g.
 * `UNICEF_e.V_project_1085_20260305_145754.pdf` in gitignored
 * `data/unicef/time-tracking/teamleader/`). All person names, project
 * names, and ticket IDs have been replaced with anonymised equivalents.
 *
 * The Teamleader PDF export renders a table with columns:
 *   Projekt | Datum | Dauer (Stunden) | Beschreibung | Position | Aufgabe
 *
 * Each row represents a time entry. The date is DD-MM-YYYY, the duration
 * is in decimal hours. Descriptions may contain Jira ticket IDs or URLs.
 *
 * ## Run
 *
 *   npx tsx packages/clients/src/time-tracking/teamleader-pdf/__fixtures__/create-sample-timesheet.ts
 */
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";

import PDFDocument from "pdfkit";

const OUTPUT = resolve(import.meta.dirname, "sample-timesheet.pdf");

interface TimeRow {
  projekt: string;
  datum: string;
  dauer: string;
  beschreibung: string;
  position: string;
  aufgabe: string;
}

const HEADERS = [
  "Projekt",
  "Datum",
  "Dauer (Stunden)",
  "Beschreibung",
  "Position",
  "Aufgabe",
];

const COL_WIDTHS = [90, 80, 50, 170, 70, 70];

// 12 data rows (matching the Excel fixture pattern):
// - 11 entries survive L1 cleaning (duration >= 0.1)
// - 1 entry has 0.05h and is filtered out
const DATA_ROWS: TimeRow[] = [
  // Entry 1: DIRECT (single ticket)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "10-03-2025",
    dauer: "2.5",
    beschreibung: "ACME-100 Implement login feature",
    position: "Developer",
    aufgabe: "Development",
  },
  // Entry 2: KBV (no ticket)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "10-03-2025",
    dauer: "0.5",
    beschreibung: "daily standup",
    position: "Developer",
    aufgabe: "Meeting",
  },
  // Entry 3: DIRECT (Jira URL)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "11-03-2025",
    dauer: "3",
    beschreibung:
      "https://acme.atlassian.net/browse/ACME-101 review and testing",
    position: "Developer",
    aufgabe: "Development",
  },
  // Entry 4: MULTI_ID_SPLIT (2 IDs)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "12-03-2025",
    dauer: "4",
    beschreibung: "ACME-102, ACME-103 cross-cutting refactor",
    position: "Developer",
    aufgabe: "Development",
  },
  // Entry 5: KBV (retro)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "12-03-2025",
    dauer: "1",
    beschreibung: "retro",
    position: "Developer",
    aufgabe: "Meeting",
  },
  // Entry 6: L1-filterable (0.05h)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "12-03-2025",
    dauer: "0.05",
    beschreibung: "quick check",
    position: "Developer",
    aufgabe: "Development",
  },
  // Entry 7: DIRECT
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "13-03-2025",
    dauer: "1.5",
    beschreibung: "ACME-200 regression testing",
    position: "QA Engineer",
    aufgabe: "QA",
  },
  // Entry 8: UNLINKED_OVERHEAD (>3 IDs)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "14-03-2025",
    dauer: "6",
    beschreibung: "ACME-201, ACME-202, ACME-203, ACME-204 sprint review items",
    position: "QA Engineer",
    aufgabe: "QA",
  },
  // Entry 9: KBV (daily)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "14-03-2025",
    dauer: "0.25",
    beschreibung: "daily",
    position: "QA Engineer",
    aufgabe: "Meeting",
  },
  // Entry 10: MULTI_ID_SPLIT (3 IDs)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "15-03-2025",
    dauer: "3",
    beschreibung: "ACME-300, ACME-301, ACME-302 e2e suite",
    position: "QA Engineer",
    aufgabe: "QA",
  },
  // Entry 11: DIRECT
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "16-03-2025",
    dauer: "2",
    beschreibung: "ACME-200 final verification",
    position: "QA Engineer",
    aufgabe: "QA",
  },
  // Entry 12: KBV (PR review)
  {
    projekt: "ACME: Weiterentwicklung 2025",
    datum: "16-03-2025",
    dauer: "0.5",
    beschreibung: "PR review",
    position: "QA Engineer",
    aufgabe: "QA",
  },
];

function main() {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 40,
  });

  const stream = createWriteStream(OUTPUT);
  doc.pipe(stream);

  // Title
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .text("Project Time Report", { align: "center" });
  doc.moveDown(0.5);

  // Metadata
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Project: ACME: Weiterentwicklung 2025", { align: "left" });
  doc.text("Period: 10-03-2025 – 16-03-2025");
  doc.text("Generated: 17-03-2025");
  doc.moveDown(1);

  // Table header
  const startX = 40;
  let y = doc.y;

  doc.font("Helvetica-Bold").fontSize(8);
  let x = startX;
  for (let i = 0; i < HEADERS.length; i++) {
    doc.text(HEADERS[i], x, y, { width: COL_WIDTHS[i] });
    x += COL_WIDTHS[i];
  }
  y += 15;

  // Horizontal line under header
  doc.moveTo(startX, y).lineTo(startX + COL_WIDTHS.reduce((a, b) => a + b, 0), y).stroke();
  y += 5;

  // Data rows
  doc.font("Helvetica").fontSize(8);

  for (const row of DATA_ROWS) {
    const values = [
      row.projekt,
      row.datum,
      row.dauer,
      row.beschreibung,
      row.position,
      row.aufgabe,
    ];

    // Check if we need a new page
    if (y > 500) {
      doc.addPage();
      y = 40;
      // Repeat header on new page
      doc.font("Helvetica-Bold").fontSize(8);
      x = startX;
      for (let i = 0; i < HEADERS.length; i++) {
        doc.text(HEADERS[i], x, y, { width: COL_WIDTHS[i] });
        x += COL_WIDTHS[i];
      }
      y += 15;
      doc
        .moveTo(startX, y)
        .lineTo(startX + COL_WIDTHS.reduce((a, b) => a + b, 0), y)
        .stroke();
      y += 5;
      doc.font("Helvetica").fontSize(8);
    }

    x = startX;
    for (let i = 0; i < values.length; i++) {
      doc.text(values[i], x, y, { width: COL_WIDTHS[i] });
      x += COL_WIDTHS[i];
    }
    y += 15;
  }

  // Summary line
  y += 10;
  doc
    .moveTo(startX, y)
    .lineTo(startX + COL_WIDTHS.reduce((a, b) => a + b, 0), y)
    .stroke();
  y += 5;
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Total:", startX, y, { width: COL_WIDTHS[0] });
  doc.text("", startX + COL_WIDTHS[0], y, { width: COL_WIDTHS[1] });
  const totalHours = DATA_ROWS.reduce(
    (sum, r) => sum + parseFloat(r.dauer),
    0,
  );
  doc.text(totalHours.toFixed(2), startX + COL_WIDTHS[0] + COL_WIDTHS[1], y, {
    width: COL_WIDTHS[2],
  });

  doc.end();

  stream.on("finish", () => {
    console.log(`Fixture written to ${OUTPUT}`);
    console.log(
      `Rows: ${DATA_ROWS.length}, expected 12 data entries (11 after L1 cleaning)`,
    );
  });
}

main();
