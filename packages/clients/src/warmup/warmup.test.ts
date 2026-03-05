import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { Ticket, TimeEntry, TimeSheet } from "@isv/domain";

import { SqliteDataStore } from "../cache/sqlite-data-store.js";

import type { WarmupProgressEvent } from "./warmup.js";
import { warmupProjectData } from "./warmup.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    ticketId: "PROJ-100",
    projectKey: "PROJ",
    type: "Story",
    status: "Done",
    title: "Test ticket",
    description: "A test description",
    labels: [],
    comments: [],
    createdAt: "2026-01-10T08:00:00.000Z",
    updatedAt: "2026-01-20T14:00:00.000Z",
    ...overrides,
  };
}

function makeTimeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    timestamp: "2026-01-15T09:00:00.000Z",
    durationHours: 2.5,
    rawComment: "PROJ-100 work",
    detectedIds: ["PROJ-100"],
    attributionType: "DIRECT",
    ...overrides,
  };
}

function makeTimeSheet(
  entries: TimeEntry[],
  overrides: Partial<TimeSheet> = {},
): TimeSheet {
  return {
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-31T00:00:00.000Z",
    sourceSystem: "excel",
    rawEntryCount: entries.length,
    entries,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTicketParse = vi.fn<(filePath: string) => Promise<Ticket[]>>();
const mockTimeTrackingParse = vi.fn<(filePath: string) => Promise<TimeSheet>>();

vi.mock("../jira/jira-xml/index.js", () => ({
  JiraXmlAdapter: class {
    parse = mockTicketParse;
  },
}));

vi.mock("../time-tracking/teamleader-excel/index.js", () => ({
  TeamleaderExcelAdapter: class {
    parse = mockTimeTrackingParse;
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("warmupProjectData", () => {
  const testSlug = "__warmup-test__";
  const testDir = resolve("/tmp", "warmup-test-" + Date.now());
  const dataDir = join(testDir, "data", testSlug);

  beforeEach(async () => {
    await mkdir(join(dataDir, "tickets"), { recursive: true });
    await mkdir(join(dataDir, "time-tracking"), { recursive: true });
    mockTicketParse.mockReset();
    mockTimeTrackingParse.mockReset();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("completes warmup with ticket and time-tracking data", async () => {
    // Create source files
    await writeFile(join(dataDir, "tickets", "export.xml"), "<xml/>");
    await writeFile(join(dataDir, "time-tracking", "hours.xlsx"), "fake-xlsx");

    // Configure mock adapters
    mockTicketParse.mockResolvedValue([
      makeTicket({ ticketId: "PROJ-1" }),
      makeTicket({ ticketId: "PROJ-2" }),
    ]);
    mockTimeTrackingParse.mockResolvedValue(
      makeTimeSheet([
        makeTimeEntry({ detectedIds: ["PROJ-1"] }),
        makeTimeEntry({ detectedIds: ["PROJ-2"] }),
      ]),
    );

    const result = await warmupProjectData({
      projectSlug: testSlug,
      cwd: testDir,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: testSlug,
        ticketPrefix: "PROJ",
      },
      timeTrackingConfig: {
        rawFormat: "teamleader-excel",
        dataFolderName: testSlug,
      },
    });

    expect(result.ticketCount).toBe(2);
    expect(result.timeEntryCount).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.dbPath).toContain("project.db");

    // Verify SQLite content
    const store = new SqliteDataStore(result.dbPath);
    try {
      expect(store.getAllTickets()).toHaveLength(2);
      expect(store.getAllTimeEntries()).toHaveLength(2);
      expect(store.getMeta("warmup_at")).toBeDefined();
      expect(store.getMeta("ticket_count")).toBe("2");
      expect(store.getMeta("time_entry_count")).toBe("2");
    } finally {
      store.close();
    }
  });

  it("deduplicates tickets from multiple files", async () => {
    await writeFile(join(dataDir, "tickets", "a.xml"), "<xml/>");
    await writeFile(join(dataDir, "tickets", "b.xml"), "<xml/>");

    // Both files return the same ticket, different versions
    mockTicketParse
      .mockResolvedValueOnce([
        makeTicket({
          ticketId: "PROJ-1",
          updatedAt: "2026-01-01T00:00:00.000Z",
          title: "Old version",
        }),
      ])
      .mockResolvedValueOnce([
        makeTicket({
          ticketId: "PROJ-1",
          updatedAt: "2026-02-01T00:00:00.000Z",
          title: "New version",
        }),
      ]);

    const result = await warmupProjectData({
      projectSlug: testSlug,
      cwd: testDir,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: testSlug,
        ticketPrefix: "PROJ",
      },
    });

    expect(result.ticketCount).toBe(1);

    const store = new SqliteDataStore(result.dbPath);
    try {
      const tickets = store.getAllTickets();
      expect(tickets).toHaveLength(1);
      expect(tickets[0].title).toBe("New version");
    } finally {
      store.close();
    }
  });

  it("handles partial failure — bad file among good ones", async () => {
    await writeFile(join(dataDir, "tickets", "good.xml"), "<xml/>");
    await writeFile(join(dataDir, "tickets", "bad.xml"), "<xml/>");

    mockTicketParse
      .mockResolvedValueOnce([makeTicket({ ticketId: "PROJ-1" })])
      .mockRejectedValueOnce(new Error("Malformed XML"));

    const result = await warmupProjectData({
      projectSlug: testSlug,
      cwd: testDir,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: testSlug,
        ticketPrefix: "PROJ",
      },
    });

    expect(result.ticketCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Malformed XML");

    // Good ticket should still be in the database
    const store = new SqliteDataStore(result.dbPath);
    try {
      expect(store.getAllTickets()).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("emits progress events", async () => {
    await writeFile(join(dataDir, "tickets", "export.xml"), "<xml/>");
    mockTicketParse.mockResolvedValue([makeTicket()]);

    const events: WarmupProgressEvent[] = [];

    await warmupProjectData({
      projectSlug: testSlug,
      cwd: testDir,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: testSlug,
        ticketPrefix: "PROJ",
      },
      onProgress: (event) => events.push(event),
    });

    const phases = events.map((e) => e.phase);
    expect(phases).toContain("discovering-files");
    expect(phases).toContain("parsing-tickets");
    expect(phases).toContain("parsing-time-entries");
    expect(phases).toContain("writing-database");
    expect(phases).toContain("complete");
  });

  it("is idempotent — rebuilds cleanly on second warmup", async () => {
    await writeFile(join(dataDir, "tickets", "export.xml"), "<xml/>");
    mockTicketParse.mockResolvedValue([makeTicket({ ticketId: "PROJ-1" })]);

    const result1 = await warmupProjectData({
      projectSlug: testSlug,
      cwd: testDir,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: testSlug,
        ticketPrefix: "PROJ",
      },
    });
    expect(result1.ticketCount).toBe(1);

    // Run again — should clear and rebuild
    mockTicketParse.mockResolvedValue([
      makeTicket({ ticketId: "PROJ-1" }),
      makeTicket({ ticketId: "PROJ-2" }),
    ]);

    const result2 = await warmupProjectData({
      projectSlug: testSlug,
      cwd: testDir,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: testSlug,
        ticketPrefix: "PROJ",
      },
    });
    expect(result2.ticketCount).toBe(2);

    const store = new SqliteDataStore(result2.dbPath);
    try {
      expect(store.getAllTickets()).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("handles zero source files gracefully", async () => {
    // No files in the directories
    const result = await warmupProjectData({
      projectSlug: testSlug,
      cwd: testDir,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: testSlug,
        ticketPrefix: "PROJ",
      },
    });

    expect(result.ticketCount).toBe(0);
    expect(result.timeEntryCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
