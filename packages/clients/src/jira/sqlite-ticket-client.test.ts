import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Ticket } from "@isv/domain";

import { SqliteDataStore } from "../cache/sqlite-data-store.js";

import { SqliteTicketClient } from "./sqlite-ticket-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testDir = join("/tmp", "sqlite-ticket-client-test-" + Date.now());

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SqliteTicketClient", () => {
  let dbPath: string;
  let client: SqliteTicketClient;
  let store: SqliteDataStore;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, `project-${Date.now()}.db`);

    // Pre-populate the database
    store = new SqliteDataStore(dbPath);
    store.insertTickets([
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
    ]);
    store.close();

    client = new SqliteTicketClient(dbPath);
  });

  afterEach(() => {
    client.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // No query (all tickets)
  // -----------------------------------------------------------------------

  it("returns all tickets when no query is provided", async () => {
    const result = await client.getTickets();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(5);
    }
  });

  // -----------------------------------------------------------------------
  // mode: "all"
  // -----------------------------------------------------------------------

  it("returns all tickets for mode 'all'", async () => {
    const result = await client.getTickets({ mode: "all" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(5);
    }
  });

  // -----------------------------------------------------------------------
  // mode: "byTicketNumbers"
  // -----------------------------------------------------------------------

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

  it("returns empty for non-matching ticket numbers", async () => {
    const result = await client.getTickets({
      mode: "byTicketNumbers",
      ticketIds: ["PROJ-999"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  // -----------------------------------------------------------------------
  // mode: "withSubtasks"
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Timeframe filtering
  // -----------------------------------------------------------------------

  it("applies timeframe filter", async () => {
    // Rebuild with distinct updatedAt timestamps
    client.close();
    const dbPath2 = join(testDir, `project-tf-${Date.now()}.db`);
    const store2 = new SqliteDataStore(dbPath2);
    store2.insertTickets([
      makeTicket({ ticketId: "PROJ-A", updatedAt: "2026-01-10T00:00:00.000Z" }),
      makeTicket({ ticketId: "PROJ-B", updatedAt: "2026-02-10T00:00:00.000Z" }),
      makeTicket({ ticketId: "PROJ-C", updatedAt: "2026-03-10T00:00:00.000Z" }),
    ]);
    store2.close();
    client = new SqliteTicketClient(dbPath2);

    const result = await client.getTickets({
      mode: "all",
      timeframe: {
        start: "2026-01-15T00:00:00.000Z",
        end: "2026-02-15T00:00:00.000Z",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticketId).toBe("PROJ-B");
    }
  });

  // -----------------------------------------------------------------------
  // Empty database
  // -----------------------------------------------------------------------

  it("returns empty results from an empty database", async () => {
    client.close();
    const emptyDbPath = join(testDir, `empty-${Date.now()}.db`);
    const emptyStore = new SqliteDataStore(emptyDbPath);
    emptyStore.close();

    client = new SqliteTicketClient(emptyDbPath);
    const result = await client.getTickets();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });
});
