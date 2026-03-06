import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Result of a cache purge operation.
 */
export interface CachePurgeResult {
  /** Whether the cache directory existed and was deleted. */
  purged: boolean;
  /** Absolute path to the cache directory. */
  cacheDir: string;
}

/**
 * Delete all cached data for a project.
 *
 * Removes the `data/<slug>/cache/` directory recursively. This deletes
 * Architecture Scanner and Status Quo Miner cache entries. Calibration
 * run data (`data/<slug>/calibration-runs/`) is NOT affected.
 *
 * Idempotent: if the cache directory does not exist, returns successfully
 * with `purged: false`.
 *
 * @param projectSlug - The project slug (e.g. "unicef").
 * @param cwd - Working directory to resolve data paths from.
 * @returns Whether the cache was purged and the resolved path.
 */
export async function purgeProjectCache(
  projectSlug: string,
  cwd: string,
): Promise<CachePurgeResult> {
  const cacheDir = resolve(cwd, "data", projectSlug, "cache");

  if (!existsSync(cacheDir)) {
    return { purged: false, cacheDir };
  }

  await rm(cacheDir, { recursive: true });
  return { purged: true, cacheDir };
}
