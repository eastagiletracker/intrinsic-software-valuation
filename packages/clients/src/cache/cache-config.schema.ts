import { z } from "zod";

/**
 * Configuration schema for the file-system cache layer.
 *
 * Controls whether caching is active and where cache files are stored.
 * When `enabled` is `false`, all `getOrCompute` calls bypass the cache
 * and always execute the compute function.
 */
export const CacheConfigSchema = z
  .object({
    enabled: z
      .boolean()
      .default(false)
      .describe("Enable or disable the file-system cache"),
    cacheDir: z
      .string()
      .min(1)
      .describe(
        "Root directory for cache files, e.g. data/<project>/.cache",
      ),
  })
  .describe(
    "Cache configuration: enable/disable flag and root directory path",
  );

export type CacheConfig = z.infer<typeof CacheConfigSchema>;
