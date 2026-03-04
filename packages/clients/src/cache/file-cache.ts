import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import type { ZodType } from "zod";

import type { CacheConfig } from "./cache-config.schema.js";

/**
 * File-system-based JSON cache.
 *
 * Provides a single `getOrCompute()` method that transparently caches
 * the result of an async computation as a JSON file. Cache files are
 * human-readable (2-space indentation) and written atomically via
 * temp-file-then-rename to prevent corruption from interrupted writes.
 *
 * When a Zod schema is provided, cached values are validated on read.
 * If validation fails (e.g. after a schema change), the stale entry
 * is treated as a cache miss — the compute function runs, the file is
 * overwritten, and the fresh result is returned.
 */
export class FileCache {
  private readonly config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Return a cached result or compute, cache, and return a fresh one.
   *
   * @param key    - Relative cache key (e.g. `jira/getTickets/ab12cd34`).
   * @param compute - Async function that produces the value on cache miss.
   * @param schema  - Optional Zod schema to validate the cached JSON.
   * @returns The cached or freshly computed value.
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    schema?: ZodType<T>,
  ): Promise<T> {
    if (!this.config.enabled) {
      return compute();
    }

    const filePath = join(this.config.cacheDir, `${key}.json`);

    // --- Try cache hit ---
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);

      if (schema) {
        const result = schema.safeParse(parsed);
        if (result.success) {
          return result.data;
        }
        // Validation failed → treat as miss, fall through to compute
      } else {
        return parsed as T;
      }
    } catch {
      // File not found or JSON parse error → cache miss
    }

    // --- Cache miss: compute, write, return ---
    const value = await compute();
    await this.writeAtomically(filePath, value);
    return value;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Write JSON atomically: write to a temp file in the same directory,
   * then rename. This prevents partial / corrupt files on crash.
   */
  private async writeAtomically<T>(filePath: string, value: T): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    const tmpPath = join(dir, `.tmp-${randomUUID()}.json`);
    const json = JSON.stringify(value, null, 2);
    await writeFile(tmpPath, json, "utf-8");
    await rename(tmpPath, filePath);
  }
}
