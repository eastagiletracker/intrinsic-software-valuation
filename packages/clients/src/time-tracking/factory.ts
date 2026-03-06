import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { TimeEntry, TimeSheet } from "@isv/domain";

import type { CacheConfig } from "../cache/cache-config.schema.js";
import { FileCache } from "../cache/file-cache.js";
import { SqliteDataStore } from "../cache/sqlite-data-store.js";
import type { SourceFileMeta } from "../cache/sqlite-data-store.js";

import { CachedTimeTrackingClient } from "./cached-time-tracking-client.js";
import type { TimeTrackingClient } from "./client.js";
import type {
  TimeTrackingClientConfig,
  TimeTrackingSource,
} from "./client-config.schema.js";
import type { TimeTrackingPort } from "./port.js";
import { ProjektronBcsExcelAdapter } from "./projektron-bcs-excel/index.js";
import type { TimeTrackingQuery } from "./query.schema.js";
import { SqliteTimeTrackingClient } from "./sqlite-time-tracking-client.js";
import { TeamleaderExcelAdapter } from "./teamleader-excel/index.js";
import { TeamleaderPdfAdapter } from "./teamleader-pdf/index.js";

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** File extensions accepted per raw format. */
const FORMAT_EXTENSIONS: Record<string, string[]> = {
  "teamleader-excel": [".xlsx"],
  "teamleader-pdf": [".pdf"],
  "projektron-bcs-excel": [".xlsx"],
};

/**
 * Discover matching source files in a directory.
 * Only top-level files with the expected extension are returned.
 */
async function discoverFilesInDir(
  dir: string,
  extensions: string[],
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => extensions.some((ext) => f.endsWith(ext)))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Discover files for a legacy single-format config.
 * Looks in `data/<dataFolderName>/time-tracking/`.
 */
async function discoverFiles(
  dataFolderName: string,
  extensions: string[],
): Promise<string[]> {
  const dir = resolve("data", dataFolderName, "time-tracking");
  return discoverFilesInDir(dir, extensions);
}

/**
 * Discover files for a source with a subfolder.
 * Looks in `data/<dataFolderName>/time-tracking/<subFolder>/`.
 */
async function discoverFilesForSource(
  dataFolderName: string,
  source: TimeTrackingSource,
): Promise<string[]> {
  const extensions = FORMAT_EXTENSIONS[source.rawFormat] ?? [];
  const dir = resolve(
    "data",
    dataFolderName,
    "time-tracking",
    source.subFolder,
  );
  return discoverFilesInDir(dir, extensions);
}

/**
 * Discover all source files across all configured sources.
 */
async function discoverAllSourceFiles(
  config: TimeTrackingClientConfig,
): Promise<string[]> {
  if (config.sources) {
    const all: string[] = [];
    for (const source of config.sources) {
      const files = await discoverFilesForSource(
        config.dataFolderName,
        source,
      );
      all.push(...files);
    }
    return all;
  }
  // Legacy single-format
  const extensions = FORMAT_EXTENSIONS[config.rawFormat!] ?? [];
  return discoverFiles(config.dataFolderName, extensions);
}

// ---------------------------------------------------------------------------
// Adapter resolution
// ---------------------------------------------------------------------------

function resolveAdapter(rawFormat: string): TimeTrackingPort {
  switch (rawFormat) {
    case "teamleader-excel":
      return new TeamleaderExcelAdapter();
    case "teamleader-pdf":
      return new TeamleaderPdfAdapter();
    case "projektron-bcs-excel":
      return new ProjektronBcsExcelAdapter();
    default:
      throw new Error(
        `Unknown time-tracking raw format: "${rawFormat}". ` +
          'Supported formats: "teamleader-excel", "teamleader-pdf", "projektron-bcs-excel".',
      );
  }
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

function filterEntries(
  entries: TimeEntry[],
  query: TimeTrackingQuery | undefined,
  ticketPrefix: string,
): TimeEntry[] {
  if (!query) return entries;

  let result = entries;

  if (query.ticketIds) {
    const idSet = new Set(query.ticketIds);
    result = result.filter((e) =>
      e.detectedIds.some(
        (id) => id.startsWith(`${ticketPrefix}-`) && idSet.has(id),
      ),
    );
  }

  if (query.timeframe) {
    const start = new Date(query.timeframe.start).getTime();
    const end = new Date(query.timeframe.end).getTime();
    result = result.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= start && ts <= end;
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Merge helper
// ---------------------------------------------------------------------------

function mergeTimeSheets(sheets: TimeSheet[]): TimeSheet {
  if (sheets.length === 0) {
    const now = new Date().toISOString();
    return {
      periodStart: now,
      periodEnd: now,
      sourceSystem: "unknown",
      rawEntryCount: 0,
      entries: [],
    };
  }

  const allEntries = sheets
    .flatMap((s) => s.entries)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  const rawEntryCount = sheets.reduce((sum, s) => sum + s.rawEntryCount, 0);
  const sourceSystems = [...new Set(sheets.map((s) => s.sourceSystem))];
  const sourceSystem =
    sourceSystems.length === 1 ? sourceSystems[0] : sourceSystems.join("+");

  const timestamps = allEntries.map((e) => new Date(e.timestamp).getTime());
  const periodStart =
    timestamps.length > 0
      ? new Date(Math.min(...timestamps)).toISOString()
      : sheets[0].periodStart;
  const periodEnd =
    timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : sheets[0].periodEnd;

  return {
    periodStart,
    periodEnd,
    sourceSystem,
    rawEntryCount,
    entries: allEntries,
  };
}

// ---------------------------------------------------------------------------
// DefaultTimeTrackingClient
// ---------------------------------------------------------------------------

/**
 * Default implementation of `TimeTrackingClient`.
 *
 * Parses all discovered source files via the resolved adapter(s), merges
 * entries into a single `TimeSheet`, and applies query filters on demand.
 *
 * Supports both single-adapter mode (legacy) and multi-adapter mode
 * where each file group has its own adapter.
 */
class DefaultTimeTrackingClient implements TimeTrackingClient {
  private readonly fileGroups: Array<{
    adapter: TimeTrackingPort;
    files: string[];
  }>;
  private readonly ticketPrefix: string;

  constructor(
    fileGroups: Array<{ adapter: TimeTrackingPort; files: string[] }>,
    ticketPrefix: string,
  ) {
    this.fileGroups = fileGroups;
    this.ticketPrefix = ticketPrefix;
  }

  async getTimeSheet(query?: TimeTrackingQuery): Promise<TimeSheet> {
    const totalFiles = this.fileGroups.reduce(
      (sum, g) => sum + g.files.length,
      0,
    );

    if (totalFiles === 0) {
      const now = new Date().toISOString();
      return {
        periodStart: now,
        periodEnd: now,
        sourceSystem: "unknown",
        rawEntryCount: 0,
        entries: [],
      };
    }

    const allSheets = await Promise.all(
      this.fileGroups.flatMap((group) =>
        group.files.map((f) => group.adapter.parse(f)),
      ),
    );

    const merged = mergeTimeSheets(allSheets);
    const filtered = filterEntries(merged.entries, query, this.ticketPrefix);

    if (filtered.length === 0) {
      const now = new Date().toISOString();
      return {
        ...merged,
        entries: [],
        periodStart: query?.timeframe?.start ?? merged.periodStart,
        periodEnd: query?.timeframe?.end ?? merged.periodEnd,
      };
    }

    const timestamps = filtered.map((e) => new Date(e.timestamp).getTime());
    return {
      ...merged,
      entries: filtered,
      periodStart: new Date(Math.min(...timestamps)).toISOString(),
      periodEnd: new Date(Math.max(...timestamps)).toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ready-to-use `TimeTrackingClient` from project-specific config.
 *
 * The factory resolves the correct adapter(s) based on `rawFormat` or
 * `sources`, discovers source files inside `data/<dataFolderName>/time-tracking/`
 * (and optional subfolders), and returns a client instance that can be
 * queried with structured filter criteria.
 *
 * When a pre-warmed SQLite database exists at `data/<dataFolderName>/project.db`,
 * the factory returns a `SqliteTimeTrackingClient` for fast indexed queries.
 *
 * @param config - Project-specific configuration (ticket prefix, data folder, raw format or sources).
 * @param cacheConfig - Optional cache configuration. When enabled, results are cached to disk.
 * @returns A `Promise` resolving to an initialised `TimeTrackingClient`.
 */
export async function createTimeTrackingClient(
  config: TimeTrackingClientConfig,
  cacheConfig?: CacheConfig,
): Promise<TimeTrackingClient> {
  // Check for a pre-warmed SQLite database
  const dbPath = resolve("data", config.dataFolderName, "project.db");
  if (existsSync(dbPath)) {
    try {
      const probe = new SqliteDataStore(dbPath);
      const warmupAt = probe.getMeta("warmup_at");
      probe.close();

      if (warmupAt) {
        // Collect source file metadata for staleness check
        const allFiles = await discoverAllSourceFiles(config);
        const sourceFiles: SourceFileMeta[] = [];
        for (const f of allFiles) {
          try {
            const s = await stat(f);
            sourceFiles.push({
              path: f,
              mtime: s.mtime.toISOString(),
              size: s.size,
            });
          } catch {
            // File disappeared — will trigger staleness
          }
        }

        console.error(
          `Using SQLite data store (warmed up at ${warmupAt})`,
        );
        return new SqliteTimeTrackingClient(dbPath, sourceFiles);
      }
    } catch {
      // Fall through to file-based client
    }
  }

  console.error(
    "Using file-based adapter (no SQLite database found)",
  );

  // Build file groups — one per adapter
  const fileGroups: Array<{ adapter: TimeTrackingPort; files: string[] }> = [];

  if (config.sources) {
    for (const source of config.sources) {
      const adapter = resolveAdapter(source.rawFormat);
      const files = await discoverFilesForSource(
        config.dataFolderName,
        source,
      );
      fileGroups.push({ adapter, files });
    }
  } else {
    // Legacy single-format mode
    const adapter = resolveAdapter(config.rawFormat!);
    const extensions = FORMAT_EXTENSIONS[config.rawFormat!] ?? [];
    const files = await discoverFiles(config.dataFolderName, extensions);
    fileGroups.push({ adapter, files });
  }

  const client: TimeTrackingClient = new DefaultTimeTrackingClient(
    fileGroups,
    config.ticketPrefix,
  );

  if (cacheConfig?.enabled) {
    return new CachedTimeTrackingClient(client, new FileCache(cacheConfig));
  }
  return client;
}
