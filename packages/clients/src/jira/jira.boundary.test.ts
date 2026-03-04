import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTicketClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Tier 3 — component boundary test
// Full factory → adapter → domain path within the jira client package.
// Fixture-derived data placed into a temp data folder; no external I/O.
// ---------------------------------------------------------------------------

const FIXTURE_XML = resolve(
  import.meta.dirname,
  "jira-xml",
  "__fixtures__",
  "sample-export.xml",
);
const DATA_DIR = resolve("data", "__test-ticket-integration__", "tickets");

describe("TicketClient — component boundary", () => {
  beforeEach(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await copyFile(FIXTURE_XML, resolve(DATA_DIR, "sample.xml"));
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-ticket-integration__"), {
      recursive: true,
      force: true,
    });
  });

  it("creates a client and fetches all tickets", async () => {
    const client = await createTicketClient({
      dataFolderName: "__test-ticket-integration__",
      ticketPrefix: "ACME",
      rawFormat: "jira-xml",
    });

    const result = await client.getTickets({ mode: "all" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(6);
      for (const ticket of result.data) {
        expect(ticket.ticketId).toMatch(/^ACME-\d+$/);
      }
    }
  });

  it("filters by ticket numbers", async () => {
    const client = await createTicketClient({
      dataFolderName: "__test-ticket-integration__",
      ticketPrefix: "ACME",
      rawFormat: "jira-xml",
    });

    const result = await client.getTickets({
      mode: "byTicketNumbers",
      ticketIds: ["ACME-100", "ACME-200"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data.map((t) => t.ticketId).sort()).toEqual([
        "ACME-100",
        "ACME-200",
      ]);
    }
  });

  it("filters with subtasks", async () => {
    const client = await createTicketClient({
      dataFolderName: "__test-ticket-integration__",
      ticketPrefix: "ACME",
      rawFormat: "jira-xml",
    });

    const result = await client.getTickets({
      mode: "withSubtasks",
      parentIds: ["ACME-100"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // ACME-100 + subtasks ACME-101, ACME-102
      expect(result.data).toHaveLength(3);
      expect(result.data.map((t) => t.ticketId).sort()).toEqual([
        "ACME-100",
        "ACME-101",
        "ACME-102",
      ]);
    }
  });

  it("returns empty result for no files", async () => {
    const client = await createTicketClient({
      dataFolderName: "__nonexistent_fixture__",
      ticketPrefix: "ACME",
      rawFormat: "jira-xml",
    });

    const result = await client.getTickets();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });
});
