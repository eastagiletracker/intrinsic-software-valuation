import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { CalibrationRunOutput, ShipUnitCluster } from "@isv/domain";

import type {
  RunStore,
  RunRecord,
  ClusterRecord,
  RunStatus,
  ClusterStatus,
  RunConfig,
} from "./run-store.port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function generateRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cal-${ts}-${rand}`;
}

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
// SqliteRunStore
// ---------------------------------------------------------------------------

/**
 * SQLite-backed RunStore using `node:sqlite` (Node 24+, `DatabaseSync`).
 *
 * Creates the database file at the specified `dbPath`, ensures the parent
 * directory exists, enables WAL mode, and initialises the schema.
 */
export class SqliteRunStore implements RunStore {
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    // Ensure parent directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    // Dynamic import of node:sqlite to keep the module loadable on older
    // Node versions that lack the built-in.
    let DatabaseSyncCtor: new (path: string) => DatabaseSync;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteMod = require("node:sqlite");
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

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id       TEXT PRIMARY KEY,
        project_slug TEXT NOT NULL,
        config       TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        result       TEXT
      );

      CREATE TABLE IF NOT EXISTS clusters (
        cluster_id  TEXT NOT NULL,
        run_id      TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        data        TEXT,
        error       TEXT,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (run_id, cluster_id),
        FOREIGN KEY (run_id) REFERENCES runs(run_id)
      );
    `);
  }

  // -----------------------------------------------------------------------
  // Runs
  // -----------------------------------------------------------------------

  createRun(config: RunConfig): RunRecord {
    const runId = generateRunId();
    const ts = now();
    const projectSlug = config.projectSlug ?? "default";

    this.db
      .prepare(
        `INSERT INTO runs (run_id, project_slug, config, status, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(runId, projectSlug, JSON.stringify(config), ts, ts);

    return {
      runId,
      projectSlug,
      config,
      status: "pending",
      createdAt: ts,
      updatedAt: ts,
    };
  }

  getRun(runId: string): RunRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE run_id = ?")
      .get(runId);
    return row ? this.toRunRecord(row) : undefined;
  }

  updateRunStatus(runId: string, status: RunStatus): void {
    this.db
      .prepare("UPDATE runs SET status = ?, updated_at = ? WHERE run_id = ?")
      .run(status, now(), runId);
  }

  completeRun(runId: string, result: CalibrationRunOutput): void {
    this.db
      .prepare(
        "UPDATE runs SET status = 'completed', result = ?, updated_at = ? WHERE run_id = ?",
      )
      .run(JSON.stringify(result), now(), runId);
  }

  listRuns(): RunRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM runs ORDER BY created_at DESC")
      .all();
    return rows.map((r) => this.toRunRecord(r));
  }

  // -----------------------------------------------------------------------
  // Clusters
  // -----------------------------------------------------------------------

  createClusters(runId: string, clusterIds: string[]): void {
    const ts = now();
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO clusters (cluster_id, run_id, status, retry_count, updated_at)
       VALUES (?, ?, 'pending', 0, ?)`,
    );
    for (const id of clusterIds) {
      stmt.run(id, runId, ts);
    }
  }

  updateCluster(
    runId: string,
    clusterId: string,
    status: ClusterStatus,
    data?: ShipUnitCluster,
    error?: string,
  ): void {
    if (status === "failed") {
      // Increment retry count on failure
      this.db
        .prepare(
          `UPDATE clusters
           SET status = ?, data = ?, error = ?, retry_count = retry_count + 1, updated_at = ?
           WHERE run_id = ? AND cluster_id = ?`,
        )
        .run(
          status,
          data ? JSON.stringify(data) : null,
          error ?? null,
          now(),
          runId,
          clusterId,
        );
    } else {
      this.db
        .prepare(
          `UPDATE clusters
           SET status = ?, data = ?, error = ?, updated_at = ?
           WHERE run_id = ? AND cluster_id = ?`,
        )
        .run(
          status,
          data ? JSON.stringify(data) : null,
          error ?? null,
          now(),
          runId,
          clusterId,
        );
    }
  }

  getCluster(runId: string, clusterId: string): ClusterRecord | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM clusters WHERE run_id = ? AND cluster_id = ?",
      )
      .get(runId, clusterId);
    return row ? this.toClusterRecord(row) : undefined;
  }

  getClustersByStatus(
    runId: string,
    status: ClusterStatus,
  ): ClusterRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM clusters WHERE run_id = ? AND status = ?",
      )
      .all(runId, status);
    return rows.map((r) => this.toClusterRecord(r));
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

  private toRunRecord(row: Record<string, unknown>): RunRecord {
    return {
      runId: row.run_id as string,
      projectSlug: row.project_slug as string,
      config: JSON.parse(row.config as string) as RunConfig,
      status: row.status as RunStatus,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      result: row.result
        ? (JSON.parse(row.result as string) as CalibrationRunOutput)
        : undefined,
    };
  }

  private toClusterRecord(row: Record<string, unknown>): ClusterRecord {
    return {
      clusterId: row.cluster_id as string,
      runId: row.run_id as string,
      status: row.status as ClusterStatus,
      retryCount: row.retry_count as number,
      data: row.data
        ? (JSON.parse(row.data as string) as ShipUnitCluster)
        : undefined,
      error: (row.error as string) ?? undefined,
      updatedAt: row.updated_at as string,
    };
  }
}
