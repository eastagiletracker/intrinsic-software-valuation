import { describe, expect, it } from "vitest";

import { TicketQuerySchema } from "./query.schema.js";

describe("TicketQuerySchema", () => {
  it("accepts mode 'all'", () => {
    const result = TicketQuerySchema.parse({ mode: "all" });
    expect(result.mode).toBe("all");
  });

  it("accepts mode 'byTicketNumbers' with ticketIds", () => {
    const result = TicketQuerySchema.parse({
      mode: "byTicketNumbers",
      ticketIds: ["PROJ-123", "PROJ-456"],
    });
    expect(result.mode).toBe("byTicketNumbers");
    if (result.mode === "byTicketNumbers") {
      expect(result.ticketIds).toEqual(["PROJ-123", "PROJ-456"]);
    }
  });

  it("rejects 'byTicketNumbers' without ticketIds", () => {
    expect(() =>
      TicketQuerySchema.parse({ mode: "byTicketNumbers" }),
    ).toThrow();
  });

  it("rejects 'byTicketNumbers' with empty ticketIds", () => {
    expect(() =>
      TicketQuerySchema.parse({ mode: "byTicketNumbers", ticketIds: [] }),
    ).toThrow();
  });

  it("accepts mode 'withSubtasks' with parentIds", () => {
    const result = TicketQuerySchema.parse({
      mode: "withSubtasks",
      parentIds: ["PROJ-100"],
    });
    expect(result.mode).toBe("withSubtasks");
    if (result.mode === "withSubtasks") {
      expect(result.parentIds).toEqual(["PROJ-100"]);
    }
  });

  it("rejects 'withSubtasks' without parentIds", () => {
    expect(() =>
      TicketQuerySchema.parse({ mode: "withSubtasks" }),
    ).toThrow();
  });

  it("rejects 'withSubtasks' with empty parentIds", () => {
    expect(() =>
      TicketQuerySchema.parse({ mode: "withSubtasks", parentIds: [] }),
    ).toThrow();
  });

  it("rejects an unknown mode", () => {
    expect(() =>
      TicketQuerySchema.parse({ mode: "unknown" }),
    ).toThrow();
  });
});
