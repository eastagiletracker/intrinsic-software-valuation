import type { TimeSheet } from "@isv/domain";
import { describe, expect, it, vi } from "vitest";

import { FileCache } from "../cache/file-cache.js";
import type { CacheConfig } from "../cache/cache-config.schema.js";

import { CachedTimeTrackingClient } from "./cached-time-tracking-client.js";
import type { TimeTrackingClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTimeSheet(): TimeSheet {
  return {
    periodStart: "2024-01-01T00:00:00Z",
    periodEnd: "2024-06-01T00:00:00Z",
    sourceSystem: "teamleader",
    rawEntryCount: 10,
    entries: [],
  };
}

function mockInner(): TimeTrackingClient {
  return {
    getTimeSheet: vi.fn<TimeTrackingClient["getTimeSheet"]>().mockResolvedValue(makeTimeSheet()),
  };
}

function disabledCache(): FileCache {
  return new FileCache({ enabled: false, cacheDir: "/tmp/unused" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CachedTimeTrackingClient", () => {
  it("delegates getTimeSheet to inner client when cache is disabled", async () => {
    const inner = mockInner();
    const cached = new CachedTimeTrackingClient(inner, disabledCache());

    const result = await cached.getTimeSheet();

    expect(inner.getTimeSheet).toHaveBeenCalledOnce();
    expect(result.sourceSystem).toBe("teamleader");
  });

  it("passes query parameters through to inner client", async () => {
    const inner = mockInner();
    const cached = new CachedTimeTrackingClient(inner, disabledCache());
    const query = { ticketIds: ["ACME-1" as `${string}-${number}`] };

    await cached.getTimeSheet(query);

    expect(inner.getTimeSheet).toHaveBeenCalledWith(query);
  });

  it("returns inner client result", async () => {
    const expected = makeTimeSheet();
    const inner: TimeTrackingClient = {
      getTimeSheet: vi.fn<TimeTrackingClient["getTimeSheet"]>().mockResolvedValue(expected),
    };
    const cached = new CachedTimeTrackingClient(inner, disabledCache());

    const result = await cached.getTimeSheet();
    expect(result).toEqual(expected);
  });

  it("uses FileCache.getOrCompute for caching", async () => {
    const inner = mockInner();
    const config: CacheConfig = { enabled: true, cacheDir: "/tmp/test-cache" };
    const cache = new FileCache(config);
    const spy = vi.spyOn(cache, "getOrCompute").mockResolvedValue(makeTimeSheet());

    const cached = new CachedTimeTrackingClient(inner, cache);
    await cached.getTimeSheet();

    expect(spy).toHaveBeenCalledOnce();
    expect(inner.getTimeSheet).not.toHaveBeenCalled();
  });
});
