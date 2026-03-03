import { describe, expect, it } from "vitest";

import { TimeTrackingQuerySchema } from "./query.schema.js";

describe("TimeTrackingQuerySchema", () => {
  it("accepts an empty query (all mode)", () => {
    expect(TimeTrackingQuerySchema.parse({})).toEqual({});
  });

  it("accepts a query with ticketIds only", () => {
    const query = { ticketIds: ["PROJ-123", "PROJ-456"] };
    expect(TimeTrackingQuerySchema.parse(query)).toEqual(query);
  });

  it("accepts a query with timeframe only", () => {
    const query = {
      timeframe: {
        start: "2025-01-01T00:00:00Z",
        end: "2025-06-30T23:59:59Z",
      },
    };
    expect(TimeTrackingQuerySchema.parse(query)).toEqual(query);
  });

  it("accepts a combined query (ticketIds + timeframe)", () => {
    const query = {
      ticketIds: ["PROJ-123"],
      timeframe: {
        start: "2025-01-01T00:00:00Z",
        end: "2025-12-31T23:59:59Z",
      },
    };
    expect(TimeTrackingQuerySchema.parse(query)).toEqual(query);
  });

  it("rejects an empty ticketIds array", () => {
    expect(() =>
      TimeTrackingQuerySchema.parse({ ticketIds: [] }),
    ).toThrow();
  });

  it("rejects an invalid timestamp in timeframe", () => {
    expect(() =>
      TimeTrackingQuerySchema.parse({
        timeframe: { start: "not-a-date", end: "2025-12-31T23:59:59Z" },
      }),
    ).toThrow();
  });
});
