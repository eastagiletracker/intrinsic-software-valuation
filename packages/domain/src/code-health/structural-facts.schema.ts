import { z } from "zod";

/**
 * Structural facts: metrics describing system size and activity hotspots.
 *
 * Collected by the Status Quo Miner using deterministic tools (scc, jscpd, knip, git log).
 * No interpretation — only counting.
 */

/** Code volume metrics from static analysis tools. */
export const VolumeMetricsSchema = z
  .object({
    totalLinesOfCode: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Total lines of code (excluding blanks and comments) from scc",
      ),
    totalFiles: z
      .number()
      .nonnegative()
      .int()
      .describe("Absolute number of source code files"),
  })
  .describe("Code volume: lines of code and file count for the repository.");

export type VolumeMetrics = z.infer<typeof VolumeMetricsSchema>;

/** Architecture entry points — proxy for system surface area. */
export const EntryPointsSchema = z
  .object({
    controllers: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Number of backend controllers, resolvers, or API route handlers " +
          "(e.g. *Controller.java, *Resolver.ts)",
      ),
    views: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Number of frontend main views or pages " +
          "(e.g. files in /pages, /views, *Page.tsx, *Screen.tsx)",
      ),
  })
  .describe(
    "Architecture entry points as a proxy for system surface. " +
      "Highly stable for historical runs because it uses file patterns, not dynamic parsing.",
  );

export type EntryPoints = z.infer<typeof EntryPointsSchema>;

/** A single Git hotspot — a frequently changed file. */
export const GitHotspotSchema = z
  .object({
    filePath: z
      .string()
      .min(1)
      .describe(
        "Path of the frequently changed file relative to repository root",
      ),
    changeCount: z
      .number()
      .nonnegative()
      .int()
      .describe(
        "Number of commits that touched this file in the analysis window (typically 12 months)",
      ),
  })
  .describe(
    "A file identified as a Git hotspot — frequently changed, indicating a nervous core component.",
  );

export type GitHotspot = z.infer<typeof GitHotspotSchema>;

/** All structural facts for a repository at a point in time. */
export const StructuralFactsSchema = z
  .object({
    volume: VolumeMetricsSchema,
    entryPoints: EntryPointsSchema,
    gitHotspots: z
      .array(GitHotspotSchema)
      .describe(
        "Top 50 most frequently changed files in the analysis window. " +
          "Indicates where the nervous core components are located.",
      ),
  })
  .describe(
    "Structural facts: system size (LOC, files), surface area (entry points), " +
      "and activity hotspots (frequently changed files).",
  );

export type StructuralFacts = z.infer<typeof StructuralFactsSchema>;
