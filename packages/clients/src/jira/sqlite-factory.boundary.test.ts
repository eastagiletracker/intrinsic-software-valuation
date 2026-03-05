import { copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteDataStore } from "../cache/sqlite-data-store.js";
import { warmupProjectData } from "../warmup/warmup.js";

import { createTicketClient } from "./factory.js";
import { SqliteTicketClient } from "./sqlite-ticket-client.js";

// ---------------------------------------------------------------------------
// Tier 3 — component boundary test for SQLite-aware ticket factory
// Verifies that the factory selects the correct client implementation
// based on the presence (or absence) of a warmed-up SQLite database.
// ---------------------------------------------------------------------------

const FIXTURE_XML = resolve(
  import.meta.dirname,
  "jira-xml",
  "__fixtures__",
  "sample-export.xml",
);
const DATA_FOLDER = "__test-sqlite-factory__";
const DATA_DIR = resolve("data", DATA_FOLDER);

describe("TicketClient factory — SQLite integration", () => {
  beforeEach(async () => {
    await mkdir(join(DATA_DIR, "tickets"), { recursive: true });
    await copyFile(FIXTURE_XML, join(DATA_DIR, "tickets", "sample.xml"));
  });

  afterEach(async () => {
    await rm(DATA_DIR, { recursive: true, force: true });
  });

  it("returns SqliteTicketClient when warmed-up database exists", async () => {
    // Run warmup to create the database
    const cwd = resolve(".");
    await warmupProjectData({
      projectSlug: DATA_FOLDER,
      cwd,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: DATA_FOLDER,
        ticketPrefix: "ACME",
      },
    });

    const client = await createTicketClient({
      dataFolderName: DATA_FOLDER,
      ticketPrefix: "ACME",
      rawFormat: "jira-xml",
    });

    expect(client).toBeInstanceOf(SqliteTicketClient);

    // Verify data is queryable
    const result = await client.getTickets({ mode: "all" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(6);
    }
  });

  it("falls back to DefaultTicketClient when no database exists", async () => {
    const client = await createTicketClient({
      dataFolderName: DATA_FOLDER,
      ticketPrefix: "ACME",
      rawFormat: "jira-xml",
    });

    // Should NOT be a SqliteTicketClient
    expect(client).not.toBeInstanceOf(SqliteTicketClient);

    // Should still work via file parsing
    const result = await client.getTickets({ mode: "all" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(6);
    }
  });

  it("emits staleness warning when database is stale", async () => {
    // Run warmup
    const cwd = resolve(".");
    await warmupProjectData({
      projectSlug: DATA_FOLDER,
      cwd,
      jiraConfig: {
        rawFormat: "jira-xml",
        dataFolderName: DATA_FOLDER,
        ticketPrefix: "ACME",
      },
    });

    // Tamper with the source_files meta to simulate staleness
    const dbPath = join(DATA_DIR, "project.db");
    const store = new SqliteDataStore(dbPath);
    store.setMeta(
      "source_files",
      JSON.stringify([
        {
          path: "/fake/old-file.xml",
          mtime: "2020-01-01T00:00:00.000Z",
          size: 1,
        },
      ]),
    );
    store.close();

    // Capture stderr
    const stderrSpy: string[] = [];
    const origStderr = console.error;
    console.error = (...args: unknown[]) => {
      stderrSpy.push(args.join(" "));
    };

    try {
      await createTicketClient({
        dataFolderName: DATA_FOLDER,
        ticketPrefix: "ACME",
        rawFormat: "jira-xml",
      });

      // Should have logged staleness warning
      expect(
        stderrSpy.some((msg) => msg.includes("stale")),
      ).toBe(true);
    } finally {
      console.error = origStderr;
    }
  });
});
