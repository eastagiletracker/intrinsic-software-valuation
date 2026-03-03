import { describe, expect, it } from "vitest";

import { TicketClientConfigSchema } from "./client-config.schema.js";

describe("TicketClientConfigSchema", () => {
  const valid = {
    dataFolderName: "superclient",
    ticketPrefix: "PROJ",
    rawFormat: "jira-xml" as const,
  };

  it("accepts a valid config", () => {
    expect(TicketClientConfigSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a lowercase ticketPrefix", () => {
    expect(() =>
      TicketClientConfigSchema.parse({ ...valid, ticketPrefix: "proj" }),
    ).toThrow();
  });

  it("rejects an empty ticketPrefix", () => {
    expect(() =>
      TicketClientConfigSchema.parse({ ...valid, ticketPrefix: "" }),
    ).toThrow();
  });

  it("rejects a ticketPrefix with digits", () => {
    expect(() =>
      TicketClientConfigSchema.parse({ ...valid, ticketPrefix: "PR0J" }),
    ).toThrow();
  });

  it("rejects an empty dataFolderName", () => {
    expect(() =>
      TicketClientConfigSchema.parse({ ...valid, dataFolderName: "" }),
    ).toThrow();
  });

  it("rejects an unknown rawFormat", () => {
    expect(() =>
      TicketClientConfigSchema.parse({ ...valid, rawFormat: "csv" }),
    ).toThrow();
  });
});
