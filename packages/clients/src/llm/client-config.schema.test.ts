import { describe, expect, it } from "vitest";

import { LlmClientConfigSchema } from "./client-config.schema.js";

describe("LlmClientConfigSchema", () => {
  const valid = {
    provider: "github-copilot-cli" as const,
  };

  it("accepts a valid minimal config", () => {
    expect(LlmClientConfigSchema.parse(valid)).toEqual(valid);
  });

  it("accepts config with optional timeoutMs", () => {
    const config = { ...valid, timeoutMs: 60000 };
    const result = LlmClientConfigSchema.parse(config);
    expect(result.timeoutMs).toBe(60000);
  });

  it("accepts config with optional cwd", () => {
    const config = { ...valid, cwd: "/tmp/repo" };
    const result = LlmClientConfigSchema.parse(config);
    expect(result.cwd).toBe("/tmp/repo");
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      LlmClientConfigSchema.parse({ provider: "openai" }),
    ).toThrow();
  });

  it("rejects a missing provider", () => {
    expect(() => LlmClientConfigSchema.parse({})).toThrow();
  });

  it("rejects non-positive timeoutMs", () => {
    expect(() =>
      LlmClientConfigSchema.parse({ ...valid, timeoutMs: 0 }),
    ).toThrow();
  });

  it("rejects non-integer timeoutMs", () => {
    expect(() =>
      LlmClientConfigSchema.parse({ ...valid, timeoutMs: 1.5 }),
    ).toThrow();
  });

  it("rejects empty cwd", () => {
    expect(() =>
      LlmClientConfigSchema.parse({ ...valid, cwd: "" }),
    ).toThrow();
  });
});
