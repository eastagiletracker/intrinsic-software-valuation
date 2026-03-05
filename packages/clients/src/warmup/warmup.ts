import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Ticket, TimeEntry, TimeSheet } from "@isv/domain";

import { SqliteDataStore } from "../cache/sqlite-data-store.js";
import type { SourceFileMeta } from "../cache/sqlite-data-store.js";
import { JiraXmlAdapter } from "../jira/jira-xml/index.js";
import type { TicketPort } from "../jira/port.js";
import type { TimeTrackingPort } from "../time-tracking/port.js";
import { ProjektronBcsExcelAdapter } from "../time-tracking/projektron-bcs-excel/index.js";
import { TeamleaderExcelAdapter } from "../time-tracking/teamleader-excel/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WarmupConfig {
  projectSlug: string;
  cwd: string;
  jiraConfig: {
    rawFormat: string;
    dataFolderName: string;
    ticketPrefix: string;
  };
  timeTrackingConfig?: {
    rawFormat?: string;
    dataFolderName: string;
    ticketPrefix?: string;
    sources?: Array<{
      rawFormat: string;
      subFolder: string;
    }>;
  };
  onProgress?: (event: WarmupProgressEvent) => void;
}

export interface WarmupProgressEvent {
  phase:
    | "discovering-files"
    | "parsing-tickets"
    | "parsing-time-entries"
    | "writing-database"
    | "complete";
  detail?: string;
}

export interface WarmupResult {
  ticketCount: number;
  timeEntryCount: number;
  durationMs: number;
  sourceFiles: string[];
  errors: string[];
  dbPath: string;
}

// ---------------------------------------------------------------------------
// File discovery helpers
// ---------------------------------------------------------------------------

const TICKET_FORMAT_EXTENSIONS: Record<string, string[]> = {
  "jira-xml": [".xml"],
};

const TT_FORMAT_EXTENSIONS: Record<string, string[]> = {
  "teamleader-excel": [".xlsx"],
  "projektron-bcs-excel": [".xlsx"],
};

async function discoverFiles(
  baseDir: string,
  subDir: string,
  extensions: string[],
): Promise<string[]> {
  const dir = resolve(baseDir, subDir);
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

async function getFileMeta(filePath: string): Promise<SourceFileMeta> {
  const s = await stat(filePath);
  return {
    path: filePath,
    mtime: s.mtime.toISOString(),
    size: s.size,
  };
}

// ---------------------------------------------------------------------------
// Adapter resolution
// ---------------------------------------------------------------------------

function resolveTicketAdapter(rawFormat: string): TicketPort {
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

function resolveTimeTrackingAdapter(rawFormat: string): TimeTrackingPort {
  switch (rawFormat) {
    case "teamleader-excel":
      return new TeamleaderExcelAdapter();
    case "projektron-bcs-excel":
      return new ProjektronBcsExcelAdapter();
    default:
      throw new Error(
        `Unknown time-tracking raw format: "${rawFormat}". ` +
          'Supported formats: "teamleader-excel", "projektron-bcs-excel".',
      );
  }
}

// ---------------------------------------------------------------------------
// Deduplication (same logic as factory.ts)
// ---------------------------------------------------------------------------

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
// Warmup process
// ---------------------------------------------------------------------------

/**
 * Parse all raw source files and persist them into a project-local SQLite
 * database at `data/<slug>/project.db`.
 *
 * This is the entry point for the `isv init --warmup` CLI command.
 */
export async function warmupProjectData(
  config: WarmupConfig,
): Promise<WarmupResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const allSourceFiles: string[] = [];

  const emit = config.onProgress ?? (() => {});

  // 1. Discover raw files
  emit({ phase: "discovering-files" });

  const dataDir = resolve(config.cwd, "data", config.jiraConfig.dataFolderName);
  const ticketExtensions =
    TICKET_FORMAT_EXTENSIONS[config.jiraConfig.rawFormat] ?? [];
  const ticketFiles = await discoverFiles(
    dataDir,
    "tickets",
    ticketExtensions,
  );

  let timeTrackingFiles: string[] = [];
  /** Groups of files per adapter for multi-source parsing. */
  const ttFileGroups: Array<{ rawFormat: string; files: string[] }> = [];

  if (config.timeTrackingConfig) {
    const ttDataDir = resolve(
      config.cwd,
      "data",
      config.timeTrackingConfig.dataFolderName,
    );

    if (config.timeTrackingConfig.sources) {
      // Multi-source: each source has its own subfolder
      for (const source of config.timeTrackingConfig.sources) {
        const ext = TT_FORMAT_EXTENSIONS[source.rawFormat] ?? [];
        const files = await discoverFiles(
          ttDataDir,
          join("time-tracking", source.subFolder),
          ext,
        );
        ttFileGroups.push({ rawFormat: source.rawFormat, files });
        timeTrackingFiles.push(...files);
      }
    } else if (config.timeTrackingConfig.rawFormat) {
      // Legacy single-format
      const ttExtensions =
        TT_FORMAT_EXTENSIONS[config.timeTrackingConfig.rawFormat] ?? [];
      const files = await discoverFiles(
        ttDataDir,
        "time-tracking",
        ttExtensions,
      );
      ttFileGroups.push({
        rawFormat: config.timeTrackingConfig.rawFormat,
        files,
      });
      timeTrackingFiles = files;
    }
  }

  allSourceFiles.push(...ticketFiles, ...timeTrackingFiles);
  emit({
    phase: "discovering-files",
    detail: `Found ${ticketFiles.length} ticket file(s) and ${timeTrackingFiles.length} time-tracking file(s)`,
  });

  // 2. Parse ticket files
  emit({
    phase: "parsing-tickets",
    detail: `Parsing ${ticketFiles.length} ticket file(s)`,
  });

  const ticketAdapter = resolveTicketAdapter(config.jiraConfig.rawFormat);
  let allTickets: Ticket[] = [];

  for (const file of ticketFiles) {
    try {
      const tickets = await ticketAdapter.parse(file);
      allTickets.push(...tickets);
    } catch (err) {
      const msg = `Failed to parse ticket file ${file}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
    }
  }

  // Deduplicate tickets
  allTickets = deduplicateTickets(allTickets);

  // 3. Parse time-tracking files
  emit({
    phase: "parsing-time-entries",
    detail: `Parsing ${timeTrackingFiles.length} time-tracking file(s)`,
  });

  let allTimeEntries: TimeEntry[] = [];
  const sourceSystems: string[] = [];

  if (config.timeTrackingConfig && timeTrackingFiles.length > 0) {
    for (const group of ttFileGroups) {
      const ttAdapter = resolveTimeTrackingAdapter(group.rawFormat);
      for (const file of group.files) {
        try {
          const sheet: TimeSheet = await ttAdapter.parse(file);
          if (!sourceSystems.includes(sheet.sourceSystem)) {
            sourceSystems.push(sheet.sourceSystem);
          }
          allTimeEntries.push(...sheet.entries);
        } catch (err) {
          const msg = `Failed to parse time-tracking file ${file}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
        }
      }
    }
  }

  const sourceSystem =
    sourceSystems.length > 0 ? sourceSystems.join("+") : "unknown";

  // 4. Write to SQLite
  emit({ phase: "writing-database" });

  const dbPath = resolve(config.cwd, "data", config.projectSlug, "project.db");
  const store = new SqliteDataStore(dbPath);

  try {
    // Clear existing data (idempotent rebuild)
    store.clear();

    // Insert tickets
    if (allTickets.length > 0) {
      store.insertTickets(allTickets);
    }

    // Insert time entries
    if (allTimeEntries.length > 0) {
      store.insertTimeEntries(allTimeEntries, {
        sourceSystem,
      });
    }

    // Write warmup metadata
    const sourceFileMeta: SourceFileMeta[] = [];
    for (const file of allSourceFiles) {
      try {
        sourceFileMeta.push(await getFileMeta(file));
      } catch {
        // File disappeared between discovery and meta read — ignore
      }
    }

    store.setMeta("warmup_at", new Date().toISOString());
    store.setMeta("ticket_count", String(allTickets.length));
    store.setMeta("time_entry_count", String(allTimeEntries.length));
    store.setMeta("source_files", JSON.stringify(sourceFileMeta));
  } finally {
    store.close();
  }

  const durationMs = Date.now() - startTime;

  emit({
    phase: "complete",
    detail: `${allTickets.length} tickets, ${allTimeEntries.length} time entries in ${durationMs}ms`,
  });

  return {
    ticketCount: allTickets.length,
    timeEntryCount: allTimeEntries.length,
    durationMs,
    sourceFiles: allSourceFiles,
    errors,
    dbPath,
  };
}
