import type { CacheConfig } from "@isv/clients";
import { FileCache } from "@isv/clients";

import { CachedArchitectureScannerService } from "./cached-scanner.js";
import type { ArchitectureScannerPort } from "./port.js";
import { ArchitectureScannerService } from "./service.js";

/**
 * Create an Architecture Scanner service instance.
 *
 * @param cacheConfig - Optional cache configuration. When provided with
 *   `enabled: true`, a caching decorator wraps the real scanner so that
 *   repeated scans for the same `(repositoryId, commitSha)` pair skip the
 *   LLM call.
 * @returns A configured `ArchitectureScannerPort`.
 */
export function createArchitectureScanner(
  cacheConfig?: CacheConfig,
): ArchitectureScannerPort {
  const scanner: ArchitectureScannerPort = new ArchitectureScannerService();

  if (cacheConfig?.enabled) {
    return new CachedArchitectureScannerService(
      scanner,
      new FileCache(cacheConfig),
    );
  }
  return scanner;
}
