import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import type { Ticket, TimeEntry } from "@isv/domain";

// ---------------------------------------------------------------------------
// node:sqlite types (subset we use)
// ---------------------------------------------------------------------------

interface StatementSync {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

// ---------------------------------------------------------------------------
// Source file metadata for staleness detection
// ---------------------------------------------------------------------------

export interface SourceFileMeta {
  path: string;
  mtime: string;
  size: number;
}

// ---------------------------------------------------------------------------
// SqliteDataStore
// ---------------------------------------------------------------------------

/**
 * SQLite-backed data store for parsed ticket and time-tracking data.
 *
 * Wraps a `node:sqlite` `DatabaseSync` connection to `data/<slug>/project.db`.
 * Used by the warmup process to persist parsed data, and by the Sqlite*Client
 * classes to serve fast indexed queries.
 */
export class SqliteDataStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    // Ensure parent directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    // Dynamic require of node:sqlite via createRequire for ESM compatibility.
    let DatabaseSyncCtor: new (path: string) => DatabaseSync;
    try {
      const esmRequire = createRequire(import.meta.url);
      const sqliteMod = esmRequire("node:sqlite");
      DatabaseSyncCtor = sqliteMod.DatabaseSync;
    } catch {
      throw new Error(
        "node:sqlite is not available in this Node.js version. " +
          "Please use Node 24+ or install better-sqlite3 as a fallback.",
      );
    }

    this.db = new DatabaseSyncCtor(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.initSchema();
  }

  // -----------------------------------------------------------------------
  // Schema
  // -----------------------------------------------------------------------

  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id    TEXT PRIMARY KEY,
        project_key  TEXT NOT NULL,
        type         TEXT NOT NULL,
        status       TEXT NOT NULL,
        title        TEXT NOT NULL,
        description  TEXT NOT NULL,
        parent_id    TEXT,
        story_points REAL,
        labels       TEXT NOT NULL,
        comments     TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_project_key ON tickets(project_key);
      CREATE INDEX IF NOT EXISTS idx_tickets_parent_id   ON tickets(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_created_at  ON tickets(created_at);
      CREATE INDEX IF NOT EXISTS idx_tickets_updated_at  ON tickets(updated_at);

      CREATE TABLE IF NOT EXISTS time_entries (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp        TEXT NOT NULL,
        duration_hours   REAL NOT NULL,
        raw_comment      TEXT NOT NULL,
        detected_ids     TEXT NOT NULL,
        attribution_type TEXT NOT NULL,
        source_system    TEXT NOT NULL,
        source_file      TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_time_entries_timestamp ON time_entries(timestamp);

      CREATE TABLE IF NOT EXISTS warmup_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // -----------------------------------------------------------------------
  // Ticket operations
  // -----------------------------------------------------------------------

  /**
   * Insert tickets in a single transaction using parameterized statements.
   * `labels` and `comments` are serialized as JSON strings.
   */
  insertTickets(tickets: Ticket[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tickets
        (ticket_id, project_key, type, status, title, description,
         parent_id, story_points, labels, comments, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN TRANSACTION");
    try {
      for (const t of tickets) {
        stmt.run(
          t.ticketId,
          t.projectKey,
          t.type,
          t.status,
          t.title,
          t.description,
          t.parentId ?? null,
          t.storyPoints ?? null,
          JSON.stringify(t.labels),
          JSON.stringify(t.comments),
          t.createdAt,
          t.updatedAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /**
   * Query all tickets from the database.
   * Returns deserialized `Ticket` domain objects.
   */
  getAllTickets(): Ticket[] {
    const rows = this.db.prepare("SELECT * FROM tickets").all();
    return rows.map((r) => this.toTicket(r));
  }

  /**
   * Query tickets by a list of ticket IDs.
   */
  getTicketsByIds(ids: string[]): Ticket[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT * FROM tickets WHERE ticket_id IN (${placeholders})`)
      .all(...ids);
    return rows.map((r) => this.toTicket(r));
  }

  /**
   * Query tickets by parent IDs — returns the parents themselves plus
   * any tickets whose parent_id is in the given set.
   */
  getTicketsWithSubtasks(parentIds: string[]): Ticket[] {
    if (parentIds.length === 0) return [];
    const placeholders = parentIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT * FROM tickets
         WHERE ticket_id IN (${placeholders})
            OR parent_id IN (${placeholders})`,
      )
      .all(...parentIds, ...parentIds);
    return rows.map((r) => this.toTicket(r));
  }

  // -----------------------------------------------------------------------
  // Time entry operations
  // -----------------------------------------------------------------------

  /**
   * Insert time entries in a single transaction.
   */
  insertTimeEntries(
    entries: TimeEntry[],
    sourceMeta: { sourceSystem: string; sourceFile?: string },
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO time_entries
        (timestamp, duration_hours, raw_comment, detected_ids,
         attribution_type, source_system, source_file)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN TRANSACTION");
    try {
      for (const e of entries) {
        stmt.run(
          e.timestamp,
          e.durationHours,
          e.rawComment,
          JSON.stringify(e.detectedIds),
          e.attributionType,
          sourceMeta.sourceSystem,
          sourceMeta.sourceFile ?? null,
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /**
   * Query all time entries from the database.
   */
  getAllTimeEntries(): Array<
    TimeEntry & { sourceSystem: string; sourceFile?: string }
  > {
    const rows = this.db
      .prepare("SELECT * FROM time_entries ORDER BY timestamp ASC")
      .all();
    return rows.map((r) => this.toTimeEntry(r));
  }

  /**
   * Query time entries with optional ticket ID and timeframe filters.
   */
  queryTimeEntries(filters?: {
    ticketIds?: string[];
    timeframe?: { start: string; end: string };
  }): Array<TimeEntry & { sourceSystem: string; sourceFile?: string }> {
    if (!filters || (!filters.ticketIds && !filters.timeframe)) {
      return this.getAllTimeEntries();
    }

    // Build query dynamically based on filters
    let sql = "SELECT * FROM time_entries WHERE 1=1";
    const params: unknown[] = [];

    if (filters.timeframe) {
      sql += " AND timestamp >= ? AND timestamp <= ?";
      params.push(filters.timeframe.start, filters.timeframe.end);
    }

    sql += " ORDER BY timestamp ASC";

    const rows = this.db.prepare(sql).all(...params);
    let entries = rows.map((r) => this.toTimeEntry(r));

    // Filter by ticketIds in JavaScript (parsing detected_ids JSON)
    // This is more reliable than json_each for our dataset size
    if (filters.ticketIds && filters.ticketIds.length > 0) {
      const idSet = new Set(filters.ticketIds);
      entries = entries.filter((e) =>
        e.detectedIds.some((id) => idSet.has(id)),
      );
    }

    return entries;
  }

  // -----------------------------------------------------------------------
  // Meta operations
  // -----------------------------------------------------------------------

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO warmup_meta (key, value) VALUES (?, ?)",
      )
      .run(key, value);
  }

  getMeta(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM warmup_meta WHERE key = ?")
      .get(key);
    return row ? (row.value as string) : undefined;
  }

  // -----------------------------------------------------------------------
  // Staleness detection
  // -----------------------------------------------------------------------

  /**
   * Check whether the database is stale by comparing current source file
   * metadata against the values stored during warmup.
   */
  isStale(sourceFiles: SourceFileMeta[]): boolean {
    const storedJson = this.getMeta("source_files");
    if (!storedJson) return true;

    let storedFiles: SourceFileMeta[];
    try {
      storedFiles = JSON.parse(storedJson) as SourceFileMeta[];
    } catch {
      return true;
    }

    // Build a lookup from stored files
    const storedMap = new Map<string, SourceFileMeta>();
    for (const f of storedFiles) {
      storedMap.set(f.path, f);
    }

    // Check for new or modified files
    for (const f of sourceFiles) {
      const stored = storedMap.get(f.path);
      if (!stored) return true; // new file
      if (stored.mtime !== f.mtime || stored.size !== f.size) return true; // modified
    }

    // Check for removed files
    if (sourceFiles.length !== storedFiles.length) return true;

    return false;
  }

  // -----------------------------------------------------------------------
  // Clear / reset
  // -----------------------------------------------------------------------

  /**
   * Drop and re-create all data tables (used at the start of each warmup).
   */
  clear(): void {
    this.db.exec(`
      DROP TABLE IF EXISTS tickets;
      DROP TABLE IF EXISTS time_entries;
      DROP TABLE IF EXISTS warmup_meta;
    `);
    this.initSchema();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  close(): void {
    this.db.close();
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  private toTicket(row: Record<string, unknown>): Ticket {
    return {
      ticketId: row.ticket_id as string,
      projectKey: row.project_key as string,
      type: row.type as string,
      status: row.status as string,
      title: row.title as string,
      description: row.description as string,
      parentId: (row.parent_id as string) ?? undefined,
      storyPoints: (row.story_points as number) ?? undefined,
      labels: JSON.parse(row.labels as string) as string[],
      comments: JSON.parse(row.comments as string) as Array<{
        author: string;
        body: string;
        createdAt: string;
      }>,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private toTimeEntry(
    row: Record<string, unknown>,
  ): TimeEntry & { sourceSystem: string; sourceFile?: string } {
    return {
      timestamp: row.timestamp as string,
      durationHours: row.duration_hours as number,
      rawComment: row.raw_comment as string,
      detectedIds: JSON.parse(row.detected_ids as string) as string[],
      attributionType: row.attribution_type as TimeEntry["attributionType"],
      sourceSystem: row.source_system as string,
      sourceFile: (row.source_file as string) ?? undefined,
    };
  }
}
