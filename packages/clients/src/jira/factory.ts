import { existsSync, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Result, Ticket } from "@isv/domain";

import type { CacheConfig } from "../cache/cache-config.schema.js";
import { FileCache } from "../cache/file-cache.js";
import { SqliteDataStore } from "../cache/sqlite-data-store.js";
import type { SourceFileMeta } from "../cache/sqlite-data-store.js";

import { CachedTicketClient } from "./cached-ticket-client.js";
import type { TicketClient } from "./client.js";
import type { TicketClientConfig } from "./client-config.schema.js";
import { JiraXmlAdapter } from "./jira-xml/index.js";
import type { TicketPort } from "./port.js";
import type { TicketQuery } from "./query.schema.js";
import { SqliteTicketClient } from "./sqlite-ticket-client.js";

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** File extensions accepted per raw format. */
const FORMAT_EXTENSIONS: Record<string, string[]> = {
  "jira-xml": [".xml"],
};

/**
 * Discover matching source files in `data/<dataFolderName>/tickets/`.
 * Only top-level files with the expected extension are returned.
 */
async function discoverFiles(
  dataFolderName: string,
  extensions: string[],
): Promise<string[]> {
  const dir = resolve("data", dataFolderName, "tickets");
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

function resolveAdapter(rawFormat: string): TicketPort {
  switch (rawFormat) {
    case "jira-xml":
      return new JiraXmlAdapter();
    default:
      throw new Error(
        `Unknown ticket raw format: "${rawFormat}". ` +
          'Supported formats: "jira-xml".',
      );
  }
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

function filterTickets(
  tickets: Ticket[],
  query: TicketQuery | undefined,
): Ticket[] {
  if (!query) return tickets;

  let result: Ticket[];

  switch (query.mode) {
    case "all":
      result = tickets;
      break;

    case "byTicketNumbers": {
      const idSet = new Set(query.ticketIds);
      result = tickets.filter((t) => idSet.has(t.ticketId));
      break;
    }

    case "withSubtasks": {
      const parentIdSet = new Set(query.parentIds);

      // Build parent → children index
      const childrenByParent = new Map<string, Ticket[]>();
      for (const ticket of tickets) {
        if (ticket.parentId) {
          const siblings = childrenByParent.get(ticket.parentId) ?? [];
          siblings.push(ticket);
          childrenByParent.set(ticket.parentId, siblings);
        }
      }

      // Collect parents + direct children
      const resultMap = new Map<string, Ticket>();
      for (const pid of parentIdSet) {
        const parent = tickets.find((t) => t.ticketId === pid);
        if (parent) {
          resultMap.set(parent.ticketId, parent);
        }
        const children = childrenByParent.get(pid) ?? [];
        for (const child of children) {
          resultMap.set(child.ticketId, child);
        }
      }

      result = [...resultMap.values()];
      break;
    }
  }

  // Apply optional timeframe filter across all modes
  if (query.timeframe) {
    const startMs = new Date(query.timeframe.start).getTime();
    const endMs = new Date(query.timeframe.end).getTime();
    result = result.filter((t) => {
      // Use updatedAt as proxy for resolution date (resolved tickets),
      // or createdAt for unresolved tickets
      const dateMs = new Date(t.updatedAt).getTime();
      return dateMs >= startMs && dateMs <= endMs;
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Deduplication helper
// ---------------------------------------------------------------------------

/**
 * Deduplicate tickets by `ticketId`, keeping the one with the latest
 * `updatedAt` timestamp when duplicates occur (e.g. from paginated exports).
 */
function deduplicateTickets(tickets: Ticket[]): Ticket[] {
  const map = new Map<string, Ticket>();
  for (const ticket of tickets) {
    const existing = map.get(ticket.ticketId);
    if (
      !existing ||
      new Date(ticket.updatedAt).getTime() >
        new Date(existing.updatedAt).getTime()
    ) {
      map.set(ticket.ticketId, ticket);
    }
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// DefaultTicketClient
// ---------------------------------------------------------------------------

/**
 * Default implementation of `TicketClient`.
 *
 * Parses all discovered source files via the resolved adapter, merges
 * and deduplicates tickets, then applies query filters on demand.
 */
class DefaultTicketClient implements TicketClient {
  private readonly adapter: TicketPort;
  private readonly files: string[];

  constructor(adapter: TicketPort, files: string[]) {
    this.adapter = adapter;
    this.files = files;
  }

  async getTickets(query?: TicketQuery): Promise<Result<Ticket[]>> {
    try {
      const batches = await Promise.all(
        this.files.map((f) => this.adapter.parse(f)),
      );
      const allTickets = deduplicateTickets(batches.flat());
      const filtered = filterTickets(allTickets, query);

      return { success: true, data: filtered };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "TICKET_PARSE_FAILED",
          message: err instanceof Error ? err.message : String(err),
          source: "ticket-client",
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ready-to-use `TicketClient` from project-specific config.
 *
 * The factory resolves the correct adapter based on `rawFormat`, discovers
 * source files inside `data/<dataFolderName>/tickets/`, and returns
 * a client instance that can be queried with structured filter criteria.
 *
 * When a pre-warmed SQLite database exists at `data/<dataFolderName>/project.db`,
 * the factory returns a `SqliteTicketClient` for fast indexed queries instead
 * of the file-parsing `DefaultTicketClient`.
 *
 * @param config - Project-specific configuration (data folder, ticket prefix, raw format).
 * @param cacheConfig - Optional cache configuration. When enabled, results are cached to disk.
 * @returns A `Promise` resolving to an initialised `TicketClient`.
 */
export async function createTicketClient(
  config: TicketClientConfig,
  cacheConfig?: CacheConfig,
): Promise<TicketClient> {
  // Check for a pre-warmed SQLite database
  const dbPath = resolve("data", config.dataFolderName, "project.db");
  if (existsSync(dbPath)) {
    try {
      // Quick check: does the file contain a tickets table?
      const probe = new SqliteDataStore(dbPath);
      const warmupAt = probe.getMeta("warmup_at");
      probe.close();

      if (warmupAt) {
        // Collect source file metadata for staleness check
        const extensions = FORMAT_EXTENSIONS[config.rawFormat] ?? [];
        const files = await discoverFiles(config.dataFolderName, extensions);
        const sourceFiles: SourceFileMeta[] = [];
        for (const f of files) {
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
        return new SqliteTicketClient(dbPath, sourceFiles);
      }
    } catch {
      // Fall through to file-based client
    }
  }

  console.error(
    "Using file-based adapter (no SQLite database found)",
  );

  const adapter = resolveAdapter(config.rawFormat);
  const extensions = FORMAT_EXTENSIONS[config.rawFormat] ?? [];
  const files = await discoverFiles(config.dataFolderName, extensions);
  const client: TicketClient = new DefaultTicketClient(adapter, files);

  if (cacheConfig?.enabled) {
    return new CachedTicketClient(client, new FileCache(cacheConfig));
  }
  return client;
}
