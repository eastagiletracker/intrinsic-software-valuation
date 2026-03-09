/**
 * Fixture generator for the Teamleader Excel adapter (v2 "Export" format).
 *
 * Creates a sanitised `.xlsx` file that mirrors the structure of the newer
 * Teamleader Focus Excel export ("Export" sheet) which uses different column
 * names and duration in minutes.
 *
 * ## Provenance
 *
 * Structure derived from a real Teamleader Excel export (e.g.
 * `be1d969e30824760bcdc6e01fffec0b4.xlsx` in gitignored
 * `data/unicef/time-tracking/teamleader/`). All person names, project
 * names, and ticket IDs have been replaced with anonymised equivalents.
 *
 * The newer Teamleader export renders columns:
 *   Datum | Dauer | Stundensatz | Wert | Kundenname | Projekt-ID |
 *   Projektname | Arbeitszeilenname | Ticket-ID | Ticketname |
 *   Beschreibung | Planer-Kommentar | Status | T&M in Rechnung gestellt
 *
 * Key differences from the v1 format:
 * - Duration is in **minutes** (no "Stunden" in header)
 * - Dates are ISO 8601 strings
 * - Dedicated Ticket-ID column
 * - No Position / Aufgabe columns
 *
 * ## Run
 *
 *   npx tsx packages/clients/src/time-tracking/teamleader-excel/__fixtures__/create-sample-timesheet-v2.ts
 */
import { resolve } from "node:path";

import ExcelJS from "exceljs";

const OUTPUT = resolve(import.meta.dirname, "sample-timesheet-v2.xlsx");

const HEADERS = [
  "Datum",
  "Dauer",
  "Stundensatz",
  "Wert",
  "Kundenname",
  "Projekt-ID",
  "Projektname",
  "Arbeitszeilenname",
  "Ticket-ID",
  "Ticketname",
  "Beschreibung",
  "Planer-Kommentar",
  "Status",
  "T&M in Rechnung gestellt",
];

interface TimeRow {
  datum: string;
  dauer: number; // minutes
  stundensatz: number;
  wert: number;
  kundenname: string;
  projektId: string;
  projektname: string;
  arbeitszeilenname: string;
  ticketId: string;
  ticketname: string;
  beschreibung: string;
  planerKommentar: string;
  status: string;
  tmInRechnungGestellt: number;
}

// 12 data rows aligned with the v1 fixture test expectations:
// - 11 entries survive L1 cleaning (duration >= 0.1h = 6 min)
// - 1 entry has 3 min (0.05h) and is filtered out
const DATA_ROWS: TimeRow[] = [
  {
    datum: "2025-03-10T09:00:00.000Z",
    dauer: 150,
    stundensatz: 100,
    wert: 250,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "ACME-100 Implement login feature",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-10T11:30:00.000Z",
    dauer: 30,
    stundensatz: 100,
    wert: 50,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "daily standup",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-11T08:00:00.000Z",
    dauer: 180,
    stundensatz: 100,
    wert: 300,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung:
      "https://acme.atlassian.net/browse/ACME-101 review and testing",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-12T09:00:00.000Z",
    dauer: 240,
    stundensatz: 100,
    wert: 400,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "ACME-102, ACME-103 cross-cutting refactor",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-12T14:00:00.000Z",
    dauer: 60,
    stundensatz: 100,
    wert: 100,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "retro",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-12T15:00:00.000Z",
    dauer: 3,
    stundensatz: 100,
    wert: 5,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "quick check",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-13T10:00:00.000Z",
    dauer: 90,
    stundensatz: 100,
    wert: 150,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "ACME-200 regression testing",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-14T08:00:00.000Z",
    dauer: 360,
    stundensatz: 100,
    wert: 600,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung:
      "ACME-201, ACME-202, ACME-203, ACME-204 sprint review items",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-14T15:00:00.000Z",
    dauer: 15,
    stundensatz: 100,
    wert: 25,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "daily",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-15T09:00:00.000Z",
    dauer: 180,
    stundensatz: 100,
    wert: 300,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "ACME-300, ACME-301, ACME-302 e2e suite",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-16T10:00:00.000Z",
    dauer: 120,
    stundensatz: 100,
    wert: 200,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "ACME-200 final verification",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  {
    datum: "2025-03-16T14:00:00.000Z",
    dauer: 30,
    stundensatz: 100,
    wert: 50,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "",
    ticketname: "",
    beschreibung: "PR review",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
  // Entry 13: Ticket-ID column entry — ticket id found in Ticket-ID column
  {
    datum: "2025-03-16T16:00:00.000Z",
    dauer: 60,
    stundensatz: 100,
    wert: 100,
    kundenname: "ACME Corp",
    projektId: "42",
    projektname: "ACME > Weiterentwicklung 2025",
    arbeitszeilenname: "Features, Bugfixing, Meetings",
    ticketId: "ACME-400",
    ticketname: "Fix payment flow",
    beschreibung: "Payment flow debugging",
    planerKommentar: "",
    status: "FINAL",
    tmInRechnungGestellt: 0,
  },
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");

  sheet.addRow(HEADERS);

  for (const row of DATA_ROWS) {
    sheet.addRow([
      row.datum,
      row.dauer,
      row.stundensatz,
      row.wert,
      row.kundenname,
      row.projektId,
      row.projektname,
      row.arbeitszeilenname,
      row.ticketId,
      row.ticketname,
      row.beschreibung,
      row.planerKommentar,
      row.status,
      row.tmInRechnungGestellt,
    ]);
  }

  await workbook.xlsx.writeFile(OUTPUT);
  console.log(`Wrote ${OUTPUT}`);
}

main();
