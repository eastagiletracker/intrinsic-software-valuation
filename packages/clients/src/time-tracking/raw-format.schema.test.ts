import { describe, expect, it } from "vitest";

import { TimeTrackingRawFormatSchema } from "./raw-format.schema.js";

describe("TimeTrackingRawFormatSchema", () => {
  it("accepts 'teamleader-excel'", () => {
    expect(TimeTrackingRawFormatSchema.parse("teamleader-excel")).toBe(
      "teamleader-excel",
    );
  });

  it("accepts 'teamleader-pdf'", () => {
    expect(TimeTrackingRawFormatSchema.parse("teamleader-pdf")).toBe(
      "teamleader-pdf",
    );
  });

  it("rejects an unknown format", () => {
    expect(() => TimeTrackingRawFormatSchema.parse("unknown")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => TimeTrackingRawFormatSchema.parse("")).toThrow();
  });
});
