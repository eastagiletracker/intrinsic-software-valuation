import { describe, expect, it } from "vitest";

import { buildCacheKey } from "./cache-key.js";

describe("buildCacheKey", () => {
  // --- Determinism ---

  it("returns the same key for identical inputs", () => {
    const a = buildCacheKey("jira", "getTickets", { mode: "all" });
    const b = buildCacheKey("jira", "getTickets", { mode: "all" });
    expect(a).toBe(b);
  });

  // --- Order independence ---

  it("produces the same key regardless of object-key order", () => {
    const a = buildCacheKey("git", "logStats", {
      repositoryId: "backend",
      since: "2024-01-01",
      until: "2024-06-01",
    });
    const b = buildCacheKey("git", "logStats", {
      until: "2024-06-01",
      since: "2024-01-01",
      repositoryId: "backend",
    });
    expect(a).toBe(b);
  });

  // --- Undefined handling ---

  it("treats undefined values the same as missing keys", () => {
    const a = buildCacheKey("jira", "getTickets", { mode: "all" });
    const b = buildCacheKey("jira", "getTickets", {
      mode: "all",
      extra: undefined,
    });
    expect(a).toBe(b);
  });

  // --- Empty params ---

  it("uses 'none' slug when params are empty", () => {
    const key = buildCacheKey("time-tracking", "getTimeSheet", {});
    expect(key).toBe("time-tracking/getTimeSheet/none");
  });

  // --- Filesystem safety ---

  it("produces a key with only safe characters", () => {
    const key = buildCacheKey("jira", "getTickets", {
      ticketIds: ["PROJ-1", "PROJ-2"],
    });
    // Allowed: a-z, A-Z, 0-9, -, _, /
    expect(key).toMatch(/^[a-zA-Z0-9_\-/]+$/);
  });

  // --- Structure ---

  it("includes client and method in the path", () => {
    const key = buildCacheKey("static-analysis", "analyze", {
      directory: "/tmp/repo",
    });
    expect(key).toMatch(/^static-analysis\/analyze\//);
  });

  // --- Different params produce different keys ---

  it("produces different keys for different parameters", () => {
    const a = buildCacheKey("jira", "getTickets", { mode: "all" });
    const b = buildCacheKey("jira", "getTickets", {
      mode: "byTicketNumbers",
      ticketIds: ["PROJ-1"],
    });
    expect(a).not.toBe(b);
  });

  // --- Nested objects ---

  it("handles nested objects deterministically", () => {
    const a = buildCacheKey("time-tracking", "getTimeSheet", {
      timeframe: { start: "2024-01-01", end: "2024-06-01" },
    });
    const b = buildCacheKey("time-tracking", "getTimeSheet", {
      timeframe: { end: "2024-06-01", start: "2024-01-01" },
    });
    expect(a).toBe(b);
  });
});
