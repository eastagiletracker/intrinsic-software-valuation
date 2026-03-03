import { describe, expect, it } from "vitest";

import { TicketRawFormatSchema } from "./raw-format.schema.js";

describe("TicketRawFormatSchema", () => {
  it("accepts 'jira-xml'", () => {
    expect(TicketRawFormatSchema.parse("jira-xml")).toBe("jira-xml");
  });

  it("rejects an unknown format", () => {
    expect(() => TicketRawFormatSchema.parse("unknown")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => TicketRawFormatSchema.parse("")).toThrow();
  });
});
