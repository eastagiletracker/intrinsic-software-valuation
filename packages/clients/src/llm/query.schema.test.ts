import { describe, expect, it } from "vitest";

import { LlmQuerySchema } from "./query.schema.js";

describe("LlmQuerySchema", () => {
  const valid = {
    systemPrompt: "You are a code analyzer.",
    userPrompt: "Analyze this repository.",
  };

  it("accepts a minimal valid query", () => {
    const result = LlmQuerySchema.parse(valid);
    expect(result.systemPrompt).toBe(valid.systemPrompt);
    expect(result.userPrompt).toBe(valid.userPrompt);
  });

  it("accepts optional temperature", () => {
    const result = LlmQuerySchema.parse({ ...valid, temperature: 0.7 });
    expect(result.temperature).toBe(0.7);
  });

  it("accepts optional maxTokens", () => {
    const result = LlmQuerySchema.parse({ ...valid, maxTokens: 4096 });
    expect(result.maxTokens).toBe(4096);
  });

  it("accepts optional cwd", () => {
    const result = LlmQuerySchema.parse({ ...valid, cwd: "/tmp/repo" });
    expect(result.cwd).toBe("/tmp/repo");
  });

  it("rejects an empty systemPrompt", () => {
    expect(() =>
      LlmQuerySchema.parse({ ...valid, systemPrompt: "" }),
    ).toThrow();
  });

  it("rejects an empty userPrompt", () => {
    expect(() =>
      LlmQuerySchema.parse({ ...valid, userPrompt: "" }),
    ).toThrow();
  });

  it("rejects temperature below 0", () => {
    expect(() =>
      LlmQuerySchema.parse({ ...valid, temperature: -0.1 }),
    ).toThrow();
  });

  it("rejects temperature above 2", () => {
    expect(() =>
      LlmQuerySchema.parse({ ...valid, temperature: 2.1 }),
    ).toThrow();
  });

  it("rejects non-positive maxTokens", () => {
    expect(() =>
      LlmQuerySchema.parse({ ...valid, maxTokens: 0 }),
    ).toThrow();
  });

  it("rejects non-integer maxTokens", () => {
    expect(() =>
      LlmQuerySchema.parse({ ...valid, maxTokens: 10.5 }),
    ).toThrow();
  });

  it("rejects missing systemPrompt", () => {
    expect(() =>
      LlmQuerySchema.parse({ userPrompt: "hello" }),
    ).toThrow();
  });

  it("rejects missing userPrompt", () => {
    expect(() =>
      LlmQuerySchema.parse({ systemPrompt: "hello" }),
    ).toThrow();
  });
});
