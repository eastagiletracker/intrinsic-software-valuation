import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FileCache } from "./file-cache.js";
import type { CacheConfig } from "./cache-config.schema.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_CACHE_DIR = resolve("data", "__test-file-cache__");

function enabledConfig(): CacheConfig {
  return { enabled: true, cacheDir: TEST_CACHE_DIR };
}

function disabledConfig(): CacheConfig {
  return { enabled: false, cacheDir: TEST_CACHE_DIR };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FileCache", () => {
  beforeEach(async () => {
    await mkdir(TEST_CACHE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  // --- Cache miss → write + return ---

  it("calls compute and writes the result on cache miss", async () => {
    const cache = new FileCache(enabledConfig());
    const compute = vi.fn().mockResolvedValue({ answer: 42 });

    const result = await cache.getOrCompute("test/miss/abc", compute);

    expect(compute).toHaveBeenCalledOnce();
    expect(result).toEqual({ answer: 42 });

    // Verify file was written
    const filePath = join(TEST_CACHE_DIR, "test/miss/abc.json");
    const raw = await readFile(filePath, "utf-8");
    expect(JSON.parse(raw)).toEqual({ answer: 42 });
  });

  // --- Cache hit → read (no compute) ---

  it("returns cached result without calling compute on cache hit", async () => {
    const cache = new FileCache(enabledConfig());
    const compute1 = vi.fn().mockResolvedValue({ value: "first" });
    const compute2 = vi.fn().mockResolvedValue({ value: "second" });

    // First call → miss
    await cache.getOrCompute("test/hit/xyz", compute1);

    // Second call → hit
    const result = await cache.getOrCompute("test/hit/xyz", compute2);

    expect(compute1).toHaveBeenCalledOnce();
    expect(compute2).not.toHaveBeenCalled();
    expect(result).toEqual({ value: "first" });
  });

  // --- Disabled mode → always compute ---

  it("always calls compute when cache is disabled", async () => {
    const cache = new FileCache(disabledConfig());
    const compute = vi.fn().mockResolvedValue("fresh");

    const r1 = await cache.getOrCompute("test/disabled/a", compute);
    const r2 = await cache.getOrCompute("test/disabled/a", compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(r1).toBe("fresh");
    expect(r2).toBe("fresh");
  });

  // --- JSON formatting ---

  it("writes JSON with 2-space indentation", async () => {
    const cache = new FileCache(enabledConfig());
    await cache.getOrCompute(
      "test/format/indent",
      async () => ({ a: 1, b: 2 }),
    );

    const filePath = join(TEST_CACHE_DIR, "test/format/indent.json");
    const raw = await readFile(filePath, "utf-8");
    expect(raw).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  // --- Zod validation: valid cache → hit ---

  it("returns validated result on cache hit when schema passes", async () => {
    const schema = z.object({ name: z.string() });
    const cache = new FileCache(enabledConfig());

    await cache.getOrCompute(
      "test/zod/valid",
      async () => ({ name: "Alice" }),
      schema,
    );

    const compute = vi.fn().mockResolvedValue({ name: "Bob" });
    const result = await cache.getOrCompute("test/zod/valid", compute, schema);

    expect(compute).not.toHaveBeenCalled();
    expect(result).toEqual({ name: "Alice" });
  });

  // --- Zod validation: invalid cache → miss + recompute ---

  it("recomputes when cached value fails Zod validation", async () => {
    const cache = new FileCache(enabledConfig());

    // Write a value that will fail the schema
    await cache.getOrCompute(
      "test/zod/stale",
      async () => ({ outdated: true }),
    );

    // Now use a stricter schema
    const schema = z.object({ name: z.string() });
    const compute = vi.fn().mockResolvedValue({ name: "Fresh" });
    const result = await cache.getOrCompute("test/zod/stale", compute, schema);

    expect(compute).toHaveBeenCalledOnce();
    expect(result).toEqual({ name: "Fresh" });
  });

  // --- Creates intermediate directories ---

  it("creates intermediate directories automatically", async () => {
    const cache = new FileCache(enabledConfig());
    await cache.getOrCompute(
      "deep/nested/dir/key",
      async () => ({ ok: true }),
    );

    const filePath = join(TEST_CACHE_DIR, "deep/nested/dir/key.json");
    const raw = await readFile(filePath, "utf-8");
    expect(JSON.parse(raw)).toEqual({ ok: true });
  });

  // --- Concurrent writes don't corrupt ---

  it("handles concurrent writes without corruption", async () => {
    const cache = new FileCache(enabledConfig());
    let counter = 0;

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        cache.getOrCompute(`test/concurrent/item-${i}`, async () => {
          counter++;
          return { index: i };
        }),
      ),
    );

    expect(counter).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(results[i]).toEqual({ index: i });
    }
  });
});
