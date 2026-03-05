import type { Result, Ticket } from "@isv/domain";
import { describe, expect, it, vi } from "vitest";

import { FileCache } from "../cache/file-cache.js";
import type { CacheConfig } from "../cache/cache-config.schema.js";

import { CachedTicketClient } from "./cached-ticket-client.js";
import type { TicketClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    ticketId: "ACME-100",
    projectKey: "ACME",
    type: "Story",
    title: "Test ticket",
    description: "A test",
    status: "Done",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-06-01T00:00:00Z",
    labels: [],
    comments: [],
    ...overrides,
  };
}

function mockInner(): TicketClient {
  return {
    getTickets: vi.fn<TicketClient["getTickets"]>().mockResolvedValue({
      success: true,
      data: [makeTicket()],
    }),
  };
}

function disabledCache(): FileCache {
  return new FileCache({ enabled: false, cacheDir: "/tmp/unused" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CachedTicketClient", () => {
  it("delegates getTickets to inner client when cache is disabled", async () => {
    const inner = mockInner();
    const cached = new CachedTicketClient(inner, disabledCache());

    const result = await cached.getTickets({ mode: "all" });

    expect(inner.getTickets).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("passes query parameters through to inner client", async () => {
    const inner = mockInner();
    const cached = new CachedTicketClient(inner, disabledCache());
    const query = { mode: "byTicketNumbers" as const, ticketIds: ["ACME-1" as `${string}-${number}`] };

    await cached.getTickets(query);

    expect(inner.getTickets).toHaveBeenCalledWith(query);
  });

  it("returns inner client result on cache miss", async () => {
    const expected: Result<Ticket[]> = {
      success: true,
      data: [makeTicket({ ticketId: "ACME-42" })],
    };
    const inner: TicketClient = {
      getTickets: vi.fn<TicketClient["getTickets"]>().mockResolvedValue(expected),
    };
    const cached = new CachedTicketClient(inner, disabledCache());

    const result = await cached.getTickets();
    expect(result).toEqual(expected);
  });

  it("caches getTickets result on enabled cache (via getOrCompute)", async () => {
    const inner = mockInner();

    // Use a spy on FileCache.getOrCompute to verify delegation
    const config: CacheConfig = { enabled: true, cacheDir: "/tmp/test-cache" };
    const cache = new FileCache(config);
    const spy = vi.spyOn(cache, "getOrCompute").mockResolvedValue({
      success: true,
      data: [makeTicket()],
    });

    const cached = new CachedTicketClient(inner, cache);
    const result = await cached.getTickets({ mode: "all" });

    expect(spy).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    // Inner should NOT be called because getOrCompute was mocked
    expect(inner.getTickets).not.toHaveBeenCalled();
  });
});
