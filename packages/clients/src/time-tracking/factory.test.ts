import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { TimeEntry, TimeSheet } from "@isv/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimeTrackingClient } from "./client.js";
import { createTimeTrackingClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    timestamp: "2025-03-15T10:00:00.000Z",
    durationHours: 2,
    rawComment: "Worked on PROJ-100",
    detectedIds: ["PROJ-100"],
    attributionType: "DIRECT",
    ...overrides,
  };
}

function makeSheet(
  entries: TimeEntry[],
  overrides: Partial<TimeSheet> = {},
): TimeSheet {
  const timestamps = entries.map((e) => new Date(e.timestamp).getTime());
  return {
    periodStart:
      timestamps.length > 0
        ? new Date(Math.min(...timestamps)).toISOString()
        : new Date().toISOString(),
    periodEnd:
      timestamps.length > 0
        ? new Date(Math.max(...timestamps)).toISOString()
        : new Date().toISOString(),
    sourceSystem: "teamleader",
    rawEntryCount: entries.length,
    entries,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock the TeamleaderExcelAdapter
// ---------------------------------------------------------------------------

const mockParse = vi.fn<(filePath: string) => Promise<TimeSheet>>();
const mockProjektronParse = vi.fn<(filePath: string) => Promise<TimeSheet>>();
const mockPdfParse = vi.fn<(filePath: string) => Promise<TimeSheet>>();

vi.mock("./teamleader-excel/index.js", () => ({
  TeamleaderExcelAdapter: class {
    parse = mockParse;
  },
}));

vi.mock("./teamleader-pdf/index.js", () => ({
  TeamleaderPdfAdapter: class {
    parse = mockPdfParse;
  },
}));

vi.mock("./projektron-bcs-excel/index.js", () => ({
  ProjektronBcsExcelAdapter: class {
    parse = mockProjektronParse;
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTimeTrackingClient", () => {
  const dataDir = resolve("data", "__test-factory__", "time-tracking");

  beforeEach(async () => {
    await mkdir(dataDir, { recursive: true });
    mockParse.mockReset();
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-factory__"), {
      recursive: true,
      force: true,
    });
  });

  // ---- Factory resolution ----

  it("throws for an unknown rawFormat", async () => {
    await expect(
      createTimeTrackingClient({
        ticketPrefix: "PROJ",
        dataFolderName: "__test-factory__",
        // Force unknown format to test error path
        rawFormat: "unknown" as "teamleader-excel",
      }),
    ).rejects.toThrow(/unknown time-tracking raw format/i);
  });

  it("returns a client instance for teamleader-excel", async () => {
    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-factory__",
      rawFormat: "teamleader-excel",
    });
    expect(client).toBeDefined();
    expect(typeof client.getTimeSheet).toBe("function");
  });

  it("returns a client instance for teamleader-pdf", async () => {
    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-factory__",
      rawFormat: "teamleader-pdf",
    });
    expect(client).toBeDefined();
    expect(typeof client.getTimeSheet).toBe("function");
  });

  // ---- No files found ----

  it("returns an empty TimeSheet when no files exist", async () => {
    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-factory__",
      rawFormat: "teamleader-excel",
    });

    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toEqual([]);
    expect(sheet.rawEntryCount).toBe(0);
  });

  it("returns an empty TimeSheet when data folder does not exist", async () => {
    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__nonexistent__",
      rawFormat: "teamleader-excel",
    });

    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toEqual([]);
  });

  // ---- File discovery ----

  it("discovers .xlsx files and passes them to the adapter", async () => {
    await writeFile(join(dataDir, "a.xlsx"), "");
    await writeFile(join(dataDir, "b.xlsx"), "");
    await writeFile(join(dataDir, "notes.txt"), ""); // should be ignored

    const entry = makeEntry();
    mockParse.mockResolvedValue(makeSheet([entry]));

    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-factory__",
      rawFormat: "teamleader-excel",
    });

    await client.getTimeSheet();

    expect(mockParse).toHaveBeenCalledTimes(2);
    const paths = mockParse.mock.calls.map((c) => c[0]);
    expect(paths.some((p) => p.endsWith("a.xlsx"))).toBe(true);
    expect(paths.some((p) => p.endsWith("b.xlsx"))).toBe(true);
  });

  // ---- Merging multiple files ----

  it("merges entries from multiple files ordered by timestamp", async () => {
    await writeFile(join(dataDir, "a.xlsx"), "");
    await writeFile(join(dataDir, "b.xlsx"), "");

    const earlyEntry = makeEntry({
      timestamp: "2025-01-10T08:00:00.000Z",
      rawComment: "Early work PROJ-1",
      detectedIds: ["PROJ-1"],
    });
    const lateEntry = makeEntry({
      timestamp: "2025-06-15T14:00:00.000Z",
      rawComment: "Late work PROJ-2",
      detectedIds: ["PROJ-2"],
    });

    mockParse
      .mockResolvedValueOnce(makeSheet([lateEntry]))
      .mockResolvedValueOnce(makeSheet([earlyEntry]));

    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-factory__",
      rawFormat: "teamleader-excel",
    });

    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toHaveLength(2);
    expect(sheet.entries[0].timestamp).toBe("2025-01-10T08:00:00.000Z");
    expect(sheet.entries[1].timestamp).toBe("2025-06-15T14:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Filtering tests (use a helper to create client with preset entries)
// ---------------------------------------------------------------------------

describe("TimeTrackingClient filtering", () => {
  const dataDir = resolve("data", "__test-filter__", "time-tracking");

  const entries: TimeEntry[] = [
    makeEntry({
      timestamp: "2025-01-15T10:00:00.000Z",
      detectedIds: ["PROJ-100"],
      rawComment: "PROJ-100 task",
    }),
    makeEntry({
      timestamp: "2025-03-01T09:00:00.000Z",
      detectedIds: ["PROJ-200", "OTHER-5"],
      rawComment: "PROJ-200 OTHER-5",
      attributionType: "MULTI_ID_SPLIT",
    }),
    makeEntry({
      timestamp: "2025-06-20T16:00:00.000Z",
      detectedIds: ["OTHER-10"],
      rawComment: "OTHER-10 only",
    }),
    makeEntry({
      timestamp: "2025-09-01T12:00:00.000Z",
      detectedIds: [],
      rawComment: "Daily standup",
      attributionType: "KBV",
    }),
  ];

  let client: TimeTrackingClient;

  beforeEach(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "data.xlsx"), "");

    mockParse.mockReset();
    mockParse.mockResolvedValue(makeSheet(entries));

    client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-filter__",
      rawFormat: "teamleader-excel",
    });
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-filter__"), {
      recursive: true,
      force: true,
    });
  });

  it("returns all entries when no query is provided", async () => {
    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toHaveLength(4);
  });

  it("returns all entries for an empty query object", async () => {
    const sheet = await client.getTimeSheet({});
    expect(sheet.entries).toHaveLength(4);
  });

  it("filters by ticket IDs scoped to the ticketPrefix", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-100"],
    });
    expect(sheet.entries).toHaveLength(1);
    expect(sheet.entries[0].detectedIds).toContain("PROJ-100");
  });

  it("filters by multiple ticket IDs", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-100", "PROJ-200"],
    });
    expect(sheet.entries).toHaveLength(2);
  });

  it("excludes entries whose detectedIds only match non-prefix IDs", async () => {
    // OTHER-10 matches the ID but doesn't start with PROJ-
    const sheet = await client.getTimeSheet({
      ticketIds: ["OTHER-10"],
    });
    expect(sheet.entries).toHaveLength(0);
  });

  it("filters by timeframe (inclusive bounds)", async () => {
    const sheet = await client.getTimeSheet({
      timeframe: {
        start: "2025-01-15T10:00:00.000Z",
        end: "2025-03-01T09:00:00.000Z",
      },
    });
    expect(sheet.entries).toHaveLength(2);
  });

  it("applies combined ticket + timeframe filter with AND semantics", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-100", "PROJ-200"],
      timeframe: {
        start: "2025-02-01T00:00:00.000Z",
        end: "2025-12-31T23:59:59.000Z",
      },
    });
    // PROJ-100 is Jan, excluded by timeframe; PROJ-200 is March, included
    expect(sheet.entries).toHaveLength(1);
    expect(sheet.entries[0].detectedIds).toContain("PROJ-200");
  });

  it("returns empty entries when no match is found", async () => {
    const sheet = await client.getTimeSheet({
      ticketIds: ["PROJ-999"],
    });
    expect(sheet.entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Multi-source / multi-format tests
// ---------------------------------------------------------------------------

describe("createTimeTrackingClient — multi-source", () => {
  const baseDir = resolve("data", "__test-multi__", "time-tracking");
  const tlDir = join(baseDir, "teamleader");
  const pbDir = join(baseDir, "projektron-bcs");

  beforeEach(async () => {
    await mkdir(tlDir, { recursive: true });
    await mkdir(pbDir, { recursive: true });
    mockParse.mockReset();
    mockProjektronParse.mockReset();
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-multi__"), {
      recursive: true,
      force: true,
    });
  });

  it("returns a client instance for projektron-bcs-excel", async () => {
    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-multi__",
      rawFormat: "projektron-bcs-excel",
    });
    expect(client).toBeDefined();
    expect(typeof client.getTimeSheet).toBe("function");
  });

  it("discovers files in subfolders per source", async () => {
    await writeFile(join(tlDir, "tl.xlsx"), "");
    await writeFile(join(pbDir, "pb.xlsx"), "");

    const tlEntry = makeEntry({ rawComment: "TL entry", detectedIds: ["PROJ-1"] });
    const pbEntry = makeEntry({
      rawComment: "PB entry",
      detectedIds: ["PROJ-2"],
      timestamp: "2025-04-01T00:00:00.000Z",
    });

    mockParse.mockResolvedValue(
      makeSheet([tlEntry], { sourceSystem: "teamleader" }),
    );
    mockProjektronParse.mockResolvedValue(
      makeSheet([pbEntry], { sourceSystem: "projektron-bcs" }),
    );

    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-multi__",
      sources: [
        { rawFormat: "teamleader-excel", subFolder: "teamleader" },
        { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
      ],
    });

    const sheet = await client.getTimeSheet();

    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockProjektronParse).toHaveBeenCalledTimes(1);
    expect(sheet.entries).toHaveLength(2);
    expect(sheet.sourceSystem).toBe("teamleader+projektron-bcs");
  });

  it("merges entries from multiple sources in timestamp order", async () => {
    await writeFile(join(tlDir, "tl.xlsx"), "");
    await writeFile(join(pbDir, "pb.xlsx"), "");

    const earlyEntry = makeEntry({
      timestamp: "2025-01-01T00:00:00.000Z",
      rawComment: "PB early",
    });
    const lateEntry = makeEntry({
      timestamp: "2025-06-01T00:00:00.000Z",
      rawComment: "TL late",
    });

    mockParse.mockResolvedValue(makeSheet([lateEntry]));
    mockProjektronParse.mockResolvedValue(makeSheet([earlyEntry]));

    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-multi__",
      sources: [
        { rawFormat: "teamleader-excel", subFolder: "teamleader" },
        { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
      ],
    });

    const sheet = await client.getTimeSheet();
    expect(sheet.entries[0].rawComment).toBe("PB early");
    expect(sheet.entries[1].rawComment).toBe("TL late");
  });

  it("handles empty subfolders gracefully", async () => {
    // teamleader subfolder has files, projektron-bcs is empty
    await writeFile(join(tlDir, "tl.xlsx"), "");

    mockParse.mockResolvedValue(makeSheet([makeEntry()]));

    const client = await createTimeTrackingClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-multi__",
      sources: [
        { rawFormat: "teamleader-excel", subFolder: "teamleader" },
        { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
      ],
    });

    const sheet = await client.getTimeSheet();
    expect(sheet.entries).toHaveLength(1);
    expect(mockProjektronParse).not.toHaveBeenCalled();
  });
});
