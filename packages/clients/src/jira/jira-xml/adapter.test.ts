import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JiraXmlAdapter } from "./adapter.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve("data", "__test-jira-xml__", "tickets");

function wrapInRss(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="0.92">
  <channel>
    <title>Test</title>
    ${items}
  </channel>
</rss>`;
}

function standardItem(): string {
  return `
<item>
  <key>PROJ-100</key>
  <project key="PROJ">Project Name</project>
  <type>Story</type>
  <status>Done</status>
  <summary>Implement feature X</summary>
  <description>&lt;p&gt;Detailed description of feature X.&lt;/p&gt;</description>
  <label>frontend</label>
  <label>refactoring</label>
  <created>Tue, 3 Mar 2026 15:33:06 +0100</created>
  <updated>Wed, 4 Mar 2026 10:00:00 +0100</updated>
</item>`;
}

function subtaskItem(): string {
  return `
<item>
  <key>PROJ-101</key>
  <project key="PROJ">Project Name</project>
  <type>Sub-Task</type>
  <status>In Progress</status>
  <summary>Subtask of feature X</summary>
  <description>Subtask description</description>
  <parent id="12345">PROJ-100</parent>
  <created>Tue, 3 Mar 2026 16:00:00 +0100</created>
  <updated>Wed, 4 Mar 2026 11:00:00 +0100</updated>
</item>`;
}

function itemWithComments(): string {
  return `
<item>
  <key>PROJ-200</key>
  <project key="PROJ">Project Name</project>
  <type>Bug</type>
  <status>Open</status>
  <summary>Fix login bug</summary>
  <description>Login fails on mobile</description>
  <comment author="5e8b02a9acb63e0b83334fdf" created="Mon, 2 Mar 2026 09:00:00 +0100">&lt;p&gt;Confirmed on iOS Safari.&lt;/p&gt;</comment>
  <comment author="abc123def456" created="Mon, 2 Mar 2026 10:00:00 +0100">Also happening on Android Chrome.</comment>
  <created>Sun, 1 Mar 2026 08:00:00 +0100</created>
  <updated>Mon, 2 Mar 2026 10:00:00 +0100</updated>
</item>`;
}

function itemWithStoryPoints(): string {
  return `
<item>
  <key>PROJ-300</key>
  <project key="PROJ">Project Name</project>
  <type>Story</type>
  <status>Done</status>
  <summary>Story with points</summary>
  <description>Has story points</description>
  <customfields>
    <customfield>
      <customfieldname>Story Points</customfieldname>
      <customfieldvalues>
        <customfieldvalue>8.0</customfieldvalue>
      </customfieldvalues>
    </customfield>
    <customfield>
      <customfieldname>Sprint</customfieldname>
      <customfieldvalues>
        <customfieldvalue>Sprint 5</customfieldvalue>
      </customfieldvalues>
    </customfield>
  </customfields>
  <created>Tue, 3 Mar 2026 12:00:00 +0100</created>
  <updated>Tue, 3 Mar 2026 14:00:00 +0100</updated>
</item>`;
}

function minimalItem(): string {
  return `
<item>
  <key>PROJ-400</key>
  <project key="PROJ">Project Name</project>
  <type>Task</type>
  <status>Open</status>
  <summary>Minimal task</summary>
  <description></description>
  <created>Mon, 2 Mar 2026 08:00:00 +0100</created>
  <updated>Mon, 2 Mar 2026 08:00:00 +0100</updated>
</item>`;
}

function malformedItem(): string {
  // Missing required fields (type, status)
  return `
<item>
  <key>PROJ-999</key>
  <summary>Malformed item</summary>
</item>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JiraXmlAdapter", () => {
  const adapter = new JiraXmlAdapter();

  beforeEach(async () => {
    await mkdir(FIXTURES_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(resolve("data", "__test-jira-xml__"), {
      recursive: true,
      force: true,
    });
  });

  it("parses a standard item with all fields", async () => {
    const filePath = join(FIXTURES_DIR, "standard.xml");
    await writeFile(filePath, wrapInRss(standardItem()));

    const tickets = await adapter.parse(filePath);

    expect(tickets).toHaveLength(1);
    const t = tickets[0];
    expect(t.ticketId).toBe("PROJ-100");
    expect(t.projectKey).toBe("PROJ");
    expect(t.type).toBe("Story");
    expect(t.status).toBe("Done");
    expect(t.title).toBe("Implement feature X");
    expect(t.description).toContain("<p>");
    expect(t.description).toContain("Detailed description of feature X.");
    expect(t.labels).toEqual(["frontend", "refactoring"]);
    expect(t.parentId).toBeUndefined();
    expect(t.storyPoints).toBeUndefined();
    expect(t.comments).toEqual([]);
    // Verify ISO 8601 date conversion
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(t.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("parses a subtask with parent reference", async () => {
    const filePath = join(FIXTURES_DIR, "subtask.xml");
    await writeFile(
      filePath,
      wrapInRss(standardItem() + subtaskItem()),
    );

    const tickets = await adapter.parse(filePath);

    expect(tickets).toHaveLength(2);
    const subtask = tickets.find((t) => t.ticketId === "PROJ-101");
    expect(subtask).toBeDefined();
    expect(subtask!.parentId).toBe("PROJ-100");
    expect(subtask!.type).toBe("Sub-Task");
  });

  it("parses comments with HTML stripping", async () => {
    const filePath = join(FIXTURES_DIR, "comments.xml");
    await writeFile(filePath, wrapInRss(itemWithComments()));

    const tickets = await adapter.parse(filePath);

    expect(tickets).toHaveLength(1);
    const t = tickets[0];
    expect(t.comments).toHaveLength(2);
    expect(t.comments[0].author).toBe("5e8b02a9acb63e0b83334fdf");
    expect(t.comments[0].body).toBe("Confirmed on iOS Safari.");
    expect(t.comments[0].body).not.toContain("<p>");
    expect(t.comments[1].author).toBe("abc123def456");
    expect(t.comments[1].body).toBe("Also happening on Android Chrome.");
    expect(t.comments[0].createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("extracts story points from custom fields", async () => {
    const filePath = join(FIXTURES_DIR, "storypoints.xml");
    await writeFile(filePath, wrapInRss(itemWithStoryPoints()));

    const tickets = await adapter.parse(filePath);

    expect(tickets).toHaveLength(1);
    expect(tickets[0].storyPoints).toBe(8);
  });

  it("handles missing optional fields gracefully", async () => {
    const filePath = join(FIXTURES_DIR, "minimal.xml");
    await writeFile(filePath, wrapInRss(minimalItem()));

    const tickets = await adapter.parse(filePath);

    expect(tickets).toHaveLength(1);
    const t = tickets[0];
    expect(t.ticketId).toBe("PROJ-400");
    expect(t.parentId).toBeUndefined();
    expect(t.storyPoints).toBeUndefined();
    expect(t.labels).toEqual([]);
    expect(t.comments).toEqual([]);
    expect(t.description).toBe("");
  });

  it("skips malformed items gracefully", async () => {
    const filePath = join(FIXTURES_DIR, "malformed.xml");
    await writeFile(
      filePath,
      wrapInRss(standardItem() + malformedItem()),
    );

    const tickets = await adapter.parse(filePath);

    // Standard item parses; malformed one is skipped
    expect(tickets).toHaveLength(1);
    expect(tickets[0].ticketId).toBe("PROJ-100");
  });

  it("returns empty array for XML with no items", async () => {
    const filePath = join(FIXTURES_DIR, "empty.xml");
    await writeFile(filePath, wrapInRss(""));

    const tickets = await adapter.parse(filePath);

    expect(tickets).toEqual([]);
  });

  it("returns empty array for non-RSS XML", async () => {
    const filePath = join(FIXTURES_DIR, "nonrss.xml");
    await writeFile(filePath, `<?xml version="1.0"?><data></data>`);

    const tickets = await adapter.parse(filePath);

    expect(tickets).toEqual([]);
  });
});
