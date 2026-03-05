import { describe, expect, it } from "vitest";

import { CacheConfigSchema } from "./cache-config.schema.js";

describe("CacheConfigSchema", () => {
  it("accepts a valid config with enabled = true", () => {
    const result = CacheConfigSchema.safeParse({
      enabled: true,
      cacheDir: "data/test/.cache",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.cacheDir).toBe("data/test/.cache");
    }
  });

  it("accepts a valid config with enabled = false", () => {
    const result = CacheConfigSchema.safeParse({
      enabled: false,
      cacheDir: "data/test/.cache",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
    }
  });

  it("defaults enabled to false when omitted", () => {
    const result = CacheConfigSchema.safeParse({
      cacheDir: "data/test/.cache",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
    }
  });

  it("rejects when cacheDir is missing", () => {
    const result = CacheConfigSchema.safeParse({ enabled: true });
    expect(result.success).toBe(false);
  });

  it("rejects when cacheDir is empty string", () => {
    const result = CacheConfigSchema.safeParse({
      enabled: true,
      cacheDir: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when enabled is not a boolean", () => {
    const result = CacheConfigSchema.safeParse({
      enabled: "yes",
      cacheDir: "data/test/.cache",
    });
    expect(result.success).toBe(false);
  });
});
