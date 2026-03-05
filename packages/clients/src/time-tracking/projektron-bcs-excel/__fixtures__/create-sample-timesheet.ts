/**
 * Fixture generator for the Projektron BCS Excel adapter.
 *
 * Creates a sanitized `.xlsx` file that mirrors the exact structure of
 * a real Projektron BCS "Nachweis (gebuchter Aufwand) für Rechnung" export.
 *
 * ## Provenance
 *
 * Structure derived from real Projektron BCS exports in
 * `data/unicef/time-tracking/projektron-bcs/`. All person names, project
 * names, and ticket IDs have been replaced with anonymized equivalents.
 *
 * ## Run
 *
 *   npx tsx packages/clients/src/time-tracking/projektron-bcs-excel/__fixtures__/create-sample-timesheet.ts
 */
import ExcelJS from "exceljs";
import { resolve } from "node:path";

const OUTPUT = resolve(import.meta.dirname, "sample-timesheet.xlsx");

async function main() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Freigabevermerk");

  // ---- Metadata rows (1-7) ----

  // Row 1: Title (merged cells)
  ws.getRow(1).getCell(1).value = "Nachweis (gebuchter Aufwand) für Rechnung";
  ws.getRow(1).getCell(2).value = "Nachweis (gebuchter Aufwand) für Rechnung";
  ws.getRow(1).getCell(3).value = "Nachweis (gebuchter Aufwand) für Rechnung";

  // Row 2: Report period + creation date (rich text)
  ws.getRow(2).getCell(1).value = {
    richText: [
      { text: "Berichtszeitraum:\n" },
      { font: { italic: true }, text: "2025-03-01 - 2025-03-31" },
    ],
  };
  ws.getRow(2).getCell(3).value = {
    richText: [
      { text: "Erstellungsdatum:\n" },
      { font: { italic: true }, text: "2025-04-02" },
    ],
  };

  // Row 3: Section label
  ws.getRow(3).getCell(1).value = "Stammdaten";
  ws.getRow(3).getCell(2).value = "Stammdaten";

  // Row 4: Project name
  ws.getRow(4).getCell(1).value = "Name:";
  ws.getRow(4).getCell(2).value = "ACME: Weiterentwicklung 2025";
  ws.getRow(4).getCell(3).value = "ACME: Weiterentwicklung 2025";

  // Row 5: Project ID
  ws.getRow(5).getCell(1).value = "Projekt-ID:";
  ws.getRow(5).getCell(2).value = "9999999999999";

  // Row 6: Client
  ws.getRow(6).getCell(1).value = "Kunde:";
  ws.getRow(6).getCell(2).value = "ACME Corp";

  // Row 7: Invoice
  ws.getRow(7).getCell(1).value = "Rechnungsnummer:";
  ws.getRow(7).getCell(2).value = "2025-00099";
  ws.getRow(7).getCell(3).value = "Rechnungsdatum:";
  ws.getRow(7).getCell(4).value = new Date("2025-04-02T00:00:00Z");

  // ---- Row 8: Column headers ----
  ws.getRow(8).getCell(1).value = "Name";
  ws.getRow(8).getCell(2).value = "Datum";
  ws.getRow(8).getCell(3).value = "Vorgang";
  ws.getRow(8).getCell(4).value = "Aufwand";
  ws.getRow(8).getCell(5).value = "Aufwand";

  // ---- Person 1: Doe, Jane ----
  const personRichText = (name: string) => ({
    richText: [
      { text: name.split(",")[0] },
      { font: { color: { argb: "FF808080" } }, text: ", " + name.split(",")[1]?.trim() },
    ],
  });

  // Row 9: Person header
  for (let c = 1; c <= 6; c++) {
    ws.getRow(9).getCell(c).value = personRichText("Doe, Jane");
  }

  // Data + comment pairs for Person 1
  let r = 10;

  // Entry 1: DIRECT (single ticket ID)
  ws.getRow(r).getCell(2).value = new Date("2025-03-03T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: Development";
  ws.getRow(r).getCell(4).value = 2.5;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "ACME-100: Implement login feature";
  r++;

  // Entry 2: KBV (no ticket)
  ws.getRow(r).getCell(2).value = new Date("2025-03-03T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: Development";
  ws.getRow(r).getCell(4).value = 0.5;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "daily standup";
  r++;

  // Entry 3: DIRECT (Jira URL)
  ws.getRow(r).getCell(2).value = new Date("2025-03-04T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: Development";
  ws.getRow(r).getCell(4).value = 3;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value =
    "https://acme.atlassian.net/browse/ACME-101 review and testing";
  r++;

  // Entry 4: MULTI_ID_SPLIT (2 IDs)
  ws.getRow(r).getCell(2).value = new Date("2025-03-05T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: Development";
  ws.getRow(r).getCell(4).value = 4;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "ACME-102, ACME-103 cross-cutting refactor";
  r++;

  // Entry 5: KBV (retro)
  ws.getRow(r).getCell(2).value = new Date("2025-03-06T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: Development";
  ws.getRow(r).getCell(4).value = 1;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "retro";
  r++;

  // Entry 6: L1-filterable (0.05h)
  ws.getRow(r).getCell(2).value = new Date("2025-03-06T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: Development";
  ws.getRow(r).getCell(4).value = 0.05;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = "*";
  r++;
  ws.getRow(r).getCell(3).value = "quick check";
  r++;

  // Empty + Summary for Person 1
  r++;
  ws.getRow(r).getCell(3).value = {
    richText: [
      { text: "Summe:\n" },
      { font: { italic: true }, text: "Fakturiert:" },
    ],
  };
  ws.getRow(r).getCell(4).value = {
    richText: [
      { text: "11.05\n" },
      { font: { italic: true }, text: "11.0" },
    ],
  };
  ws.getRow(r).getCell(5).value = {
    richText: [
      { text: "h\n" },
      { font: { italic: true }, text: "h" },
    ],
  };
  r++;

  // ---- Person 2: Smith, John ----
  for (let c = 1; c <= 6; c++) {
    ws.getRow(r).getCell(c).value = personRichText("Smith, John");
  }
  r++;

  // Entry 7: DIRECT
  ws.getRow(r).getCell(2).value = new Date("2025-03-10T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: QA";
  ws.getRow(r).getCell(4).value = 1.5;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "ACME-200 regression testing";
  r++;

  // Entry 8: UNLINKED_OVERHEAD (>3 IDs)
  ws.getRow(r).getCell(2).value = new Date("2025-03-11T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: QA";
  ws.getRow(r).getCell(4).value = 6;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value =
    "ACME-201, ACME-202, ACME-203, ACME-204 sprint review items";
  r++;

  // Entry 9: KBV (daily)
  ws.getRow(r).getCell(2).value = new Date("2025-03-12T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: QA";
  ws.getRow(r).getCell(4).value = 0.25;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "daily";
  r++;

  // Entry 10: MULTI_ID_SPLIT (3 IDs)
  ws.getRow(r).getCell(2).value = new Date("2025-03-13T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: QA";
  ws.getRow(r).getCell(4).value = 3;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "ACME-300, ACME-301, ACME-302 e2e suite";
  r++;

  // Entry 11: DIRECT
  ws.getRow(r).getCell(2).value = new Date("2025-03-14T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: QA";
  ws.getRow(r).getCell(4).value = 2;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "ACME-200 final verification";
  r++;

  // Entry 12: DIRECT (data row without comment row - edge case)
  ws.getRow(r).getCell(2).value = new Date("2025-03-14T00:00:00Z");
  ws.getRow(r).getCell(3).value = "ACME: QA";
  ws.getRow(r).getCell(4).value = 0.5;
  ws.getRow(r).getCell(5).value = "h";
  ws.getRow(r).getCell(6).value = " ";
  r++;
  ws.getRow(r).getCell(3).value = "PR review";
  r++;

  // Summary for Person 2
  r++;
  ws.getRow(r).getCell(3).value = {
    richText: [
      { text: "Summe:\n" },
      { font: { italic: true }, text: "Fakturiert:" },
    ],
  };
  ws.getRow(r).getCell(4).value = {
    richText: [
      { text: "13.25\n" },
      { font: { italic: true }, text: "13.0" },
    ],
  };
  ws.getRow(r).getCell(5).value = {
    richText: [
      { text: "h\n" },
      { font: { italic: true }, text: "h" },
    ],
  };
  r++;

  // ---- Footer ----
  r++;
  ws.getRow(r).getCell(3).value = {
    richText: [
      { text: "Gesamtsumme:\n" },
      { font: { italic: true }, text: "Gesamt Fakturiert:" },
    ],
  };
  ws.getRow(r).getCell(4).value = {
    richText: [
      { text: "24.30\n" },
      { font: { italic: true }, text: "24.0" },
    ],
  };
  ws.getRow(r).getCell(5).value = {
    richText: [
      { text: "h\n" },
      { font: { italic: true }, text: "h" },
    ],
  };
  r++;
  ws.getRow(r).getCell(1).value = "Freigabevermerk";
  r++;
  ws.getRow(r).getCell(1).value = "Bemerkung";
  ws.getRow(r).getCell(2).value = "Datum";
  ws.getRow(r).getCell(3).value = "Unterschrift";
  r++;
  ws.getRow(r).getCell(3).value = " ";

  await workbook.xlsx.writeFile(OUTPUT);
  console.log(`Fixture written to ${OUTPUT}`);
  console.log(
    `Rows: ${ws.rowCount}, expected 12 data entries (11 after L1 cleaning)`,
  );
}

main().catch(console.error);
