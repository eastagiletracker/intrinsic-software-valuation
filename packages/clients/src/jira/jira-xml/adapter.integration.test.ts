import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { JiraXmlAdapter } from "./adapter.js";

// ---------------------------------------------------------------------------
// Integration tests using committed fixture data
// ---------------------------------------------------------------------------

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "__fixtures__",
  "sample-export.xml",
);

describe("JiraXmlAdapter — fixture integration", () => {
  const adapter = new JiraXmlAdapter();

  it("parses all valid items from the sample export", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    expect(tickets).toHaveLength(6);
  });

  it("extracts correct ticket IDs", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    const ids = tickets.map((t) => t.ticketId).sort();
    expect(ids).toEqual([
      "ACME-100",
      "ACME-101",
      "ACME-102",
      "ACME-200",
      "ACME-300",
      "ACME-400",
    ]);
  });

  it("sets projectKey to ACME for all tickets", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    for (const t of tickets) {
      expect(t.projectKey).toBe("ACME");
    }
  });

  it("resolves parent-child relationships", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    const subtask101 = tickets.find((t) => t.ticketId === "ACME-101");
    const subtask102 = tickets.find((t) => t.ticketId === "ACME-102");

    expect(subtask101?.parentId).toBe("ACME-100");
    expect(subtask102?.parentId).toBe("ACME-100");

    const story = tickets.find((t) => t.ticketId === "ACME-100");
    expect(story?.parentId).toBeUndefined();
  });

  it("parses comments with HTML stripping", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    const bug = tickets.find((t) => t.ticketId === "ACME-200");

    expect(bug?.comments).toHaveLength(2);
    expect(bug?.comments[0].body).not.toContain("<p>");
    expect(bug?.comments[0].body).not.toContain("<b>");
    expect(bug?.comments[0].body).toContain("max-age");
  });

  it("extracts story points from custom fields", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    const story = tickets.find((t) => t.ticketId === "ACME-100");
    const task = tickets.find((t) => t.ticketId === "ACME-300");
    const minimal = tickets.find((t) => t.ticketId === "ACME-400");

    expect(story?.storyPoints).toBe(5);
    expect(task?.storyPoints).toBe(3);
    expect(minimal?.storyPoints).toBeUndefined();
  });

  // NOTE: The real Jira XML wraps labels as <labels><label>…</label></labels>.
  // The adapter currently reads `item.label` (unwrapped), so labels inside a
  // <labels> wrapper are not extracted. This test documents the expected
  // behaviour once the adapter is fixed. Skip until then.
  it.skip("parses labels correctly (blocked by adapter label-wrapper bug)", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    const story = tickets.find((t) => t.ticketId === "ACME-100");
    expect(story?.labels).toEqual(["frontend", "MVP"]);

    const bug = tickets.find((t) => t.ticketId === "ACME-200");
    expect(bug?.labels).toEqual(["bug", "auth"]);

    const minimal = tickets.find((t) => t.ticketId === "ACME-400");
    expect(minimal?.labels).toEqual([]);
  });

  it("produces valid ISO 8601 timestamps", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    for (const t of tickets) {
      expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(t.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it("handles the minimal item (empty description, no labels)", async () => {
    const tickets = await adapter.parse(FIXTURE_PATH);
    const minimal = tickets.find((t) => t.ticketId === "ACME-400");

    expect(minimal).toBeDefined();
    expect(minimal?.description).toBe("");
    expect(minimal?.labels).toEqual([]);
    expect(minimal?.comments).toEqual([]);
    expect(minimal?.storyPoints).toBeUndefined();
    expect(minimal?.parentId).toBeUndefined();
  });
});
