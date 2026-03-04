import { describe, expect, it } from "vitest";

import { LlmProviderSchema } from "./provider.schema.js";

describe("LlmProviderSchema", () => {
  it("accepts 'github-copilot-cli'", () => {
    expect(LlmProviderSchema.parse("github-copilot-cli")).toBe(
      "github-copilot-cli",
    );
  });

  it("rejects an unknown provider", () => {
    expect(() => LlmProviderSchema.parse("unknown")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => LlmProviderSchema.parse("")).toThrow();
  });
});
