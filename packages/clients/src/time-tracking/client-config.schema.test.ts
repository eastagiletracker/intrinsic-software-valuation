import { describe, expect, it } from "vitest";

import { TimeTrackingClientConfigSchema } from "./client-config.schema.js";

describe("TimeTrackingClientConfigSchema", () => {
  const valid = {
    ticketPrefix: "PROJ",
    dataFolderName: "superclient",
    rawFormat: "teamleader-excel" as const,
  };

  it("accepts a valid config", () => {
    expect(TimeTrackingClientConfigSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a lowercase ticketPrefix", () => {
    expect(() =>
      TimeTrackingClientConfigSchema.parse({ ...valid, ticketPrefix: "proj" }),
    ).toThrow();
  });

  it("rejects an empty ticketPrefix", () => {
    expect(() =>
      TimeTrackingClientConfigSchema.parse({ ...valid, ticketPrefix: "" }),
    ).toThrow();
  });

  it("rejects a ticketPrefix with digits", () => {
    expect(() =>
      TimeTrackingClientConfigSchema.parse({ ...valid, ticketPrefix: "PR0J" }),
    ).toThrow();
  });

  it("rejects an empty dataFolderName", () => {
    expect(() =>
      TimeTrackingClientConfigSchema.parse({ ...valid, dataFolderName: "" }),
    ).toThrow();
  });

  it("rejects an unknown rawFormat", () => {
    expect(() =>
      TimeTrackingClientConfigSchema.parse({ ...valid, rawFormat: "csv" }),
    ).toThrow();
  });
});
