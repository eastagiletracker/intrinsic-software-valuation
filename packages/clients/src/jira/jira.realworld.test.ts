import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createTicketClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Real-world tests — use gitignored data from data/unicef/
//
// These tests are skipped automatically when the data files are not present
// (e.g. in CI). Run locally with:  pnpm test:realworld
//
// File naming: *.realworld.test.ts — excluded from default `pnpm test` via
// vitest config and runnable via dedicated `pnpm test:realworld` script.
// ---------------------------------------------------------------------------

const JIRA_XML_PATH = resolve("data", "unicef", "tickets", "JIRA.xml");
const DATA_AVAILABLE = existsSync(JIRA_XML_PATH);

describe.skipIf(!DATA_AVAILABLE)(
  "TicketClient — realworld (unicef)",
  () => {
    it("parses the real Jira XML export", async () => {
      const client = await createTicketClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        rawFormat: "jira-xml",
      });

      const result = await client.getTickets({ mode: "all" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it("all tickets have UNICEF- prefix", async () => {
      const client = await createTicketClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        rawFormat: "jira-xml",
      });

      const result = await client.getTickets({ mode: "all" });

      expect(result.success).toBe(true);
      if (result.success) {
        for (const ticket of result.data) {
          expect(ticket.ticketId).toMatch(/^UNICEF-\d+$/);
          expect(ticket.projectKey).toBe("UNICEF");
        }
      }
    });

    it("all tickets have valid ISO timestamps", async () => {
      const client = await createTicketClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        rawFormat: "jira-xml",
      });

      const result = await client.getTickets({ mode: "all" });

      expect(result.success).toBe(true);
      if (result.success) {
        for (const ticket of result.data) {
          expect(ticket.createdAt).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
          );
          expect(ticket.updatedAt).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
          );
        }
      }
    });

    it("all tickets have required fields populated", async () => {
      const client = await createTicketClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        rawFormat: "jira-xml",
      });

      const result = await client.getTickets({ mode: "all" });

      expect(result.success).toBe(true);
      if (result.success) {
        for (const ticket of result.data) {
          expect(ticket.title).toBeTruthy();
          expect(ticket.type).toBeTruthy();
          expect(ticket.status).toBeTruthy();
        }
      }
    });

    it("subtask filtering works on real data", async () => {
      const client = await createTicketClient({
        dataFolderName: "unicef",
        ticketPrefix: "UNICEF",
        rawFormat: "jira-xml",
      });

      // First find a ticket that has subtasks
      const all = await client.getTickets({ mode: "all" });
      expect(all.success).toBe(true);
      if (!all.success) return;

      const parentWithSubtasks = all.data.find((t) =>
        all.data.some((child) => child.parentId === t.ticketId),
      );

      if (parentWithSubtasks) {
        const result = await client.getTickets({
          mode: "withSubtasks",
          parentIds: [parentWithSubtasks.ticketId],
        });
        expect(result.success).toBe(true);
        if (result.success) {
          // Must include the parent + at least one child
          expect(result.data.length).toBeGreaterThanOrEqual(2);
          expect(
            result.data.some(
              (t) => t.ticketId === parentWithSubtasks.ticketId,
            ),
          ).toBe(true);
        }
      }
    });
  },
);
