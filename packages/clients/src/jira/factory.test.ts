import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Ticket } from "@isv/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TicketClient } from "./client.js";
import { createTicketClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    ticketId: "PROJ-100",
    projectKey: "PROJ",
    type: "Story",
    status: "Done",
    title: "Test ticket",
    description: "Test description",
    labels: [],
    comments: [],
    createdAt: "2026-03-03T10:00:00.000Z",
    updatedAt: "2026-03-03T12:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock the JiraXmlAdapter
// ---------------------------------------------------------------------------

const mockParse = vi.fn<(filePath: string) => Promise<Ticket[]>>();

vi.mock("./jira-xml/index.js", () => ({
  JiraXmlAdapter: class {
    parse = mockParse;
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTicketClient", () => {
  const dataDir = resolve("data", "__test-ticket-factory__", "tickets");

  beforeEach(async () => {
    await mkdir(dataDir, { recursive: true });
    mockParse.mockReset();
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-ticket-factory__"), {
      recursive: true,
      force: true,
    });
  });

  // ---- Factory resolution ----

  it("throws for an unknown rawFormat", async () => {
    await expect(
      createTicketClient({
        ticketPrefix: "PROJ",
        dataFolderName: "__test-ticket-factory__",
        rawFormat: "unknown" as "jira-xml",
      }),
    ).rejects.toThrow(/unknown ticket raw format/i);
  });

  it("returns a client instance for jira-xml", async () => {
    const client = await createTicketClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-ticket-factory__",
      rawFormat: "jira-xml",
    });
    expect(client).toBeDefined();
    expect(typeof client.getTickets).toBe("function");
  });

  // ---- No files found ----

  it("returns success with empty array when no files exist", async () => {
    const client = await createTicketClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-ticket-factory__",
      rawFormat: "jira-xml",
    });

    const result = await client.getTickets();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it("returns success with empty array when data folder does not exist", async () => {
    const client = await createTicketClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__nonexistent__",
      rawFormat: "jira-xml",
    });

    const result = await client.getTickets();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  // ---- File discovery ----

  it("discovers .xml files and passes them to the adapter", async () => {
    await writeFile(join(dataDir, "a.xml"), "");
    await writeFile(join(dataDir, "b.xml"), "");
    await writeFile(join(dataDir, "notes.txt"), ""); // should be ignored

    mockParse.mockResolvedValue([makeTicket()]);

    const client = await createTicketClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-ticket-factory__",
      rawFormat: "jira-xml",
    });

    await client.getTickets();

    expect(mockParse).toHaveBeenCalledTimes(2);
    const paths = mockParse.mock.calls.map((c) => c[0]);
    expect(paths.some((p) => p.endsWith("a.xml"))).toBe(true);
    expect(paths.some((p) => p.endsWith("b.xml"))).toBe(true);
  });

  // ---- Deduplication ----

  it("deduplicates tickets from multiple files by latest updatedAt", async () => {
    await writeFile(join(dataDir, "a.xml"), "");
    await writeFile(join(dataDir, "b.xml"), "");

    const older = makeTicket({
      ticketId: "PROJ-100",
      updatedAt: "2026-03-01T10:00:00.000Z",
      title: "Older version",
    });
    const newer = makeTicket({
      ticketId: "PROJ-100",
      updatedAt: "2026-03-03T10:00:00.000Z",
      title: "Newer version",
    });

    mockParse
      .mockResolvedValueOnce([older])
      .mockResolvedValueOnce([newer]);

    const client = await createTicketClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-ticket-factory__",
      rawFormat: "jira-xml",
    });

    const result = await client.getTickets();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe("Newer version");
    }
  });
});

// ---------------------------------------------------------------------------
// Filtering tests
// ---------------------------------------------------------------------------

describe("TicketClient filtering", () => {
  const dataDir = resolve("data", "__test-ticket-filter__", "tickets");

  const tickets: Ticket[] = [
    makeTicket({ ticketId: "PROJ-1", type: "Story" }),
    makeTicket({ ticketId: "PROJ-2", type: "Story" }),
    makeTicket({
      ticketId: "PROJ-3",
      type: "Sub-Task",
      parentId: "PROJ-1",
    }),
    makeTicket({
      ticketId: "PROJ-4",
      type: "Sub-Task",
      parentId: "PROJ-1",
    }),
    makeTicket({
      ticketId: "PROJ-5",
      type: "Task",
      parentId: "PROJ-2",
    }),
  ];

  let client: TicketClient;

  beforeEach(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "data.xml"), "");

    mockParse.mockReset();
    mockParse.mockResolvedValue(tickets);

    client = await createTicketClient({
      ticketPrefix: "PROJ",
      dataFolderName: "__test-ticket-filter__",
      rawFormat: "jira-xml",
    });
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-ticket-filter__"), {
      recursive: true,
      force: true,
    });
  });

  it("returns all tickets when no query is provided", async () => {
    const result = await client.getTickets();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(5);
    }
  });

  it("returns all tickets for mode 'all'", async () => {
    const result = await client.getTickets({ mode: "all" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(5);
    }
  });

  it("filters by ticket numbers", async () => {
    const result = await client.getTickets({
      mode: "byTicketNumbers",
      ticketIds: ["PROJ-1", "PROJ-3"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data.map((t) => t.ticketId).sort()).toEqual([
        "PROJ-1",
        "PROJ-3",
      ]);
    }
  });

  it("returns empty array for ticket numbers that don't match", async () => {
    const result = await client.getTickets({
      mode: "byTicketNumbers",
      ticketIds: ["PROJ-999"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it("returns parent + direct children for 'withSubtasks'", async () => {
    const result = await client.getTickets({
      mode: "withSubtasks",
      parentIds: ["PROJ-1"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data.map((t) => t.ticketId).sort()).toEqual([
        "PROJ-1",
        "PROJ-3",
        "PROJ-4",
      ]);
    }
  });

  it("returns multiple parent clusters for 'withSubtasks'", async () => {
    const result = await client.getTickets({
      mode: "withSubtasks",
      parentIds: ["PROJ-1", "PROJ-2"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(5);
    }
  });

  it("returns only the parent when it has no subtasks", async () => {
    // PROJ-5 has a parent but no children of its own
    const result = await client.getTickets({
      mode: "withSubtasks",
      parentIds: ["PROJ-5"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticketId).toBe("PROJ-5");
    }
  });

  it("silently skips unknown parent IDs", async () => {
    const result = await client.getTickets({
      mode: "withSubtasks",
      parentIds: ["PROJ-999"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it("returns the Result error shape when adapter throws", async () => {
    mockParse.mockReset();
    mockParse.mockRejectedValue(new Error("File read failed"));

    const result = await client.getTickets();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TICKET_PARSE_FAILED");
      expect(result.error.source).toBe("ticket-client");
      expect(result.error.message).toContain("File read failed");
    }
  });
});
