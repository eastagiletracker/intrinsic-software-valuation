import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { TimeEntry, TimeSheet } from "@isv/domain";

import type { CacheConfig } from "../cache/cache-config.schema.js";
import { FileCache } from "../cache/file-cache.js";

import { CachedTimeTrackingClient } from "./cached-time-tracking-client.js";
import type { TimeTrackingClient } from "./client.js";
import type { TimeTrackingClientConfig } from "./client-config.schema.js";
import type { TimeTrackingPort } from "./port.js";
import type { TimeTrackingQuery } from "./query.schema.js";
import { TeamleaderExcelAdapter } from "./teamleader-excel/index.js";

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** File extensions accepted per raw format. */
const FORMAT_EXTENSIONS: Record<string, string[]> = {
  "teamleader-excel": [".xlsx"],
};

/**
 * Discover matching source files in `data/<dataFolderName>/time-tracking/`.
 * Only top-level files with the expected extension are returned.
 */
async function discoverFiles(
  dataFolderName: string,
  extensions: string[],
): Promise<string[]> {
  const dir = resolve("data", dataFolderName, "time-tracking");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // Directory does not exist → no files
    return [];
  }
  return entries
    .filter((f) => extensions.some((ext) => f.endsWith(ext)))
    .sort()
    .map((f) => join(dir, f));
}

// ---------------------------------------------------------------------------
// Adapter resolution
// ---------------------------------------------------------------------------

function resolveAdapter(rawFormat: string): TimeTrackingPort {
  switch (rawFormat) {
    case "teamleader-excel":
      return new TeamleaderExcelAdapter();
    default:
      throw new Error(
        `Unknown time-tracking raw format: "${rawFormat}". ` +
          'Supported formats: "teamleader-excel".',
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
  const sourceSystem = sheets[0].sourceSystem;

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
 * Parses all discovered source files via the resolved adapter, merges
 * entries into a single `TimeSheet`, and applies query filters on demand.
 */
class DefaultTimeTrackingClient implements TimeTrackingClient {
  private readonly adapter: TimeTrackingPort;
  private readonly files: string[];
  private readonly ticketPrefix: string;

  constructor(adapter: TimeTrackingPort, files: string[], ticketPrefix: string) {
    this.adapter = adapter;
    this.files = files;
    this.ticketPrefix = ticketPrefix;
  }

  async getTimeSheet(query?: TimeTrackingQuery): Promise<TimeSheet> {
    if (this.files.length === 0) {
      const now = new Date().toISOString();
      return {
        periodStart: now,
        periodEnd: now,
        sourceSystem: "unknown",
        rawEntryCount: 0,
        entries: [],
      };
    }

    const sheets = await Promise.all(
      this.files.map((f) => this.adapter.parse(f)),
    );

    const merged = mergeTimeSheets(sheets);
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
 * The factory resolves the correct adapter based on `rawFormat`, discovers
 * source files inside `data/<dataFolderName>/time-tracking/`, and returns
 * a client instance that can be queried with structured filter criteria.
 *
 * @param config - Project-specific configuration (ticket prefix, data folder, raw format).
 * @param cacheConfig - Optional cache configuration. When enabled, results are cached to disk.
 * @returns A `Promise` resolving to an initialised `TimeTrackingClient`.
 */
export async function createTimeTrackingClient(
  config: TimeTrackingClientConfig,
  cacheConfig?: CacheConfig,
): Promise<TimeTrackingClient> {
  const adapter = resolveAdapter(config.rawFormat);
  const extensions = FORMAT_EXTENSIONS[config.rawFormat] ?? [];
  const files = await discoverFiles(config.dataFolderName, extensions);
  const client: TimeTrackingClient = new DefaultTimeTrackingClient(
    adapter,
    files,
    config.ticketPrefix,
  );

  if (cacheConfig?.enabled) {
    return new CachedTimeTrackingClient(client, new FileCache(cacheConfig));
  }
  return client;
}
