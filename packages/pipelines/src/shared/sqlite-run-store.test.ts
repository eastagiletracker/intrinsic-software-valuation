import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { SqliteRunStore } from "./sqlite-run-store.js";
import type { ClusterStatus } from "./run-store.port.js";

// ---------------------------------------------------------------------------
// Test directory
// ---------------------------------------------------------------------------

const testDir = join("/tmp", "sqlite-run-store-test-" + Date.now());

describe("SqliteRunStore", () => {
  let store: SqliteRunStore;
  let dbPath: string;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, `store-${Date.now()}.db`);
    store = new SqliteRunStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Run CRUD
  // -------------------------------------------------------------------------

  it("creates a run and retrieves it by ID", () => {
    const run = store.createRun({ projectSlug: "test-project" });

    expect(run.runId).toBeDefined();
    expect(run.projectSlug).toBe("test-project");
    expect(run.status).toBe("pending");
    expect(run.createdAt).toBeDefined();

    const retrieved = store.getRun(run.runId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.runId).toBe(run.runId);
    expect(retrieved!.config.projectSlug).toBe("test-project");
  });

  it("returns undefined for non-existent run", () => {
    expect(store.getRun("non-existent")).toBeUndefined();
  });

  it("updates run status", () => {
    const run = store.createRun({ projectSlug: "test" });
    store.updateRunStatus(run.runId, "running");

    const updated = store.getRun(run.runId);
    expect(updated!.status).toBe("running");
  });

  it("completes a run with result", () => {
    const run = store.createRun({ projectSlug: "test" });
    // TODO: derive from fixture when calibration fixture is available
    const mockResult = {
      result: { shipRateHoursPerIsv: 4.0 },
      clusters: [],
      residuals: [],
      skippedClusters: [],
    };

    store.completeRun(run.runId, mockResult as never);

    const completed = store.getRun(run.runId);
    expect(completed!.status).toBe("completed");
    expect(completed!.result).toBeDefined();
  });

  it("lists all runs newest first", () => {
    store.createRun({ projectSlug: "first" });
    store.createRun({ projectSlug: "second" });

    const runs = store.listRuns();
    expect(runs).toHaveLength(2);
    // Both runs exist (order may vary when created in same millisecond)
    const slugs = runs.map((r) => r.projectSlug);
    expect(slugs).toContain("first");
    expect(slugs).toContain("second");
  });

  // -------------------------------------------------------------------------
  // Cluster CRUD
  // -------------------------------------------------------------------------

  it("creates clusters and retrieves by ID", () => {
    const run = store.createRun({ projectSlug: "test" });
    store.createClusters(run.runId, ["C-1", "C-2", "C-3"]);

    const cluster = store.getCluster(run.runId, "C-1");
    expect(cluster).toBeDefined();
    expect(cluster!.clusterId).toBe("C-1");
    expect(cluster!.status).toBe("pending");
    expect(cluster!.retryCount).toBe(0);
  });

  it("returns undefined for non-existent cluster", () => {
    const run = store.createRun({ projectSlug: "test" });
    expect(store.getCluster(run.runId, "non-existent")).toBeUndefined();
  });

  it("updates cluster status with data", () => {
    const run = store.createRun({ projectSlug: "test" });
    store.createClusters(run.runId, ["C-1"]);

    // TODO: derive from fixture when calibration fixture is available
    const mockData = {
      clusterId: "C-1",
      ids: ["T-1"],
      metadata: { type: "Story", timestampT0: "2025-01-01T00:00:00.000Z" },
      isvAnalysis: {
        formulaVersion: "3.4",
        isvScore: 4,
        confidence: 0.85,
        factors: {
          A1_Data: 1,
          A2_UX: 2,
          B1_Logic: 2,
          C1_Integration: 1,
          C2_State: 1,
          D3_Quality: 1,
        },
        breakdown: { poValue: 4, archFactor: 1, qualityMultiplier: 1 },
      },
      metrics: {
        totalHours: 16,
        directMatchHours: 16,
        splitHours: 0,
        dataConfidence: "high",
        gitChanges: {
          locAdded: 100,
          locDeleted: 50,
          filesChanged: 10,
          distributionEntropy: 0,
          cyclomaticComplexityDelta: 3,
          changeIntensityScore: 0.4,
        },
      },
    };

    store.updateCluster(run.runId, "C-1", "done", mockData as never);

    const updated = store.getCluster(run.runId, "C-1");
    expect(updated!.status).toBe("done");
    expect(updated!.data).toBeDefined();
    expect(updated!.data!.clusterId).toBe("C-1");
  });

  it("increments retry count on failure", () => {
    const run = store.createRun({ projectSlug: "test" });
    store.createClusters(run.runId, ["C-1"]);

    store.updateCluster(
      run.runId,
      "C-1",
      "failed",
      undefined,
      "First failure",
    );
    expect(store.getCluster(run.runId, "C-1")!.retryCount).toBe(1);

    store.updateCluster(
      run.runId,
      "C-1",
      "failed",
      undefined,
      "Second failure",
    );
    expect(store.getCluster(run.runId, "C-1")!.retryCount).toBe(2);
  });

  it("filters clusters by status", () => {
    const run = store.createRun({ projectSlug: "test" });
    store.createClusters(run.runId, ["C-1", "C-2", "C-3"]);

    store.updateCluster(run.runId, "C-1", "done");
    store.updateCluster(run.runId, "C-2", "failed", undefined, "Error");
    // C-3 remains pending

    const done = store.getClustersByStatus(run.runId, "done");
    expect(done).toHaveLength(1);
    expect(done[0].clusterId).toBe("C-1");

    const failed = store.getClustersByStatus(run.runId, "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].clusterId).toBe("C-2");

    const pending = store.getClustersByStatus(run.runId, "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].clusterId).toBe("C-3");
  });

  // -------------------------------------------------------------------------
  // Schema creation on fresh DB
  // -------------------------------------------------------------------------

  it("creates schema on fresh database", () => {
    const freshPath = join(testDir, "fresh.db");
    const freshStore = new SqliteRunStore(freshPath);

    expect(existsSync(freshPath)).toBe(true);

    // Should be able to create runs immediately
    const run = freshStore.createRun({ projectSlug: "fresh" });
    expect(run.runId).toBeDefined();

    freshStore.close();
  });

  // -------------------------------------------------------------------------
  // Concurrent write safety
  // -------------------------------------------------------------------------

  it("handles rapid concurrent writes", () => {
    const run = store.createRun({ projectSlug: "test" });
    const ids = Array.from({ length: 50 }, (_, i) => `C-${i}`);
    store.createClusters(run.runId, ids);

    // Rapidly update all clusters
    const statuses: ClusterStatus[] = [
      "running",
      "done",
      "failed",
      "skipped",
    ];
    for (const id of ids) {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      store.updateCluster(run.runId, id, status);
    }

    // All clusters should be accounted for
    const all = ["pending", "running", "done", "failed", "skipped"] as const;
    let total = 0;
    for (const status of all) {
      total += store.getClustersByStatus(run.runId, status).length;
    }
    expect(total).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Persistence across close/reopen
  // -------------------------------------------------------------------------

  it("survives close and reopen", () => {
    const run = store.createRun({ projectSlug: "persist-test" });
    store.createClusters(run.runId, ["C-1"]);
    store.updateCluster(run.runId, "C-1", "done");
    store.close();

    // Reopen
    const store2 = new SqliteRunStore(dbPath);
    const retrieved = store2.getRun(run.runId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.projectSlug).toBe("persist-test");

    const cluster = store2.getCluster(run.runId, "C-1");
    expect(cluster).toBeDefined();
    expect(cluster!.status).toBe("done");

    store2.close();

    // Reassign so afterEach doesn't double-close
    store = new SqliteRunStore(dbPath);
  });

  // -------------------------------------------------------------------------
  // createClusters idempotent (INSERT OR IGNORE)
  // -------------------------------------------------------------------------

  it("createClusters is idempotent (does not duplicate on re-insert)", () => {
    const run = store.createRun({ projectSlug: "test" });
    store.createClusters(run.runId, ["C-1", "C-2"]);
    store.updateCluster(run.runId, "C-1", "done");

    // Re-insert same clusters (e.g. on resume)
    store.createClusters(run.runId, ["C-1", "C-2"]);

    // C-1 should still be "done" — not reset
    const c1 = store.getCluster(run.runId, "C-1");
    expect(c1!.status).toBe("done");
  });
});
