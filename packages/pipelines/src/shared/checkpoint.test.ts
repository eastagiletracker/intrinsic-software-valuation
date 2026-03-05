import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ShipUnitCluster } from "@isv/domain";

import { CheckpointWriter, CheckpointReader } from "./checkpoint.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const testDir = join("/tmp", "checkpoint-test-" + Date.now());

function makeCluster(id: string): ShipUnitCluster {
  return {
    clusterId: id,
    ids: [id],
    metadata: {
      type: "Story",
      timestampT0: "2025-01-01T00:00:00.000Z",
    },
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
      gitChanges: {
        locAdded: 100,
        locDeleted: 50,
        filesChanged: 10,
        distributionEntropy: 1.5,
        cyclomaticComplexityDelta: 3,
        changeIntensityScore: 0.4,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CheckpointWriter / CheckpointReader", () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("write + read round-trip produces the same cluster data", async () => {
    const filePath = join(testDir, "progress.jsonl");
    const writer = new CheckpointWriter(filePath);
    const cluster = makeCluster("PROJ-1");

    await writer.append("PROJ-1", cluster);

    const loaded = await CheckpointReader.load(filePath);
    expect(loaded.size).toBe(1);
    expect(loaded.has("PROJ-1")).toBe(true);

    const entry = loaded.get("PROJ-1")!;
    expect(entry.data).toEqual(cluster);
    expect(entry.clusterId).toBe("PROJ-1");
    expect(entry.timestamp).toBeDefined();
  });

  it("supports append semantics — multiple writes accumulate", async () => {
    const filePath = join(testDir, "progress.jsonl");
    const writer = new CheckpointWriter(filePath);

    await writer.append("PROJ-1", makeCluster("PROJ-1"));
    await writer.append("PROJ-2", makeCluster("PROJ-2"));
    await writer.append("PROJ-3", makeCluster("PROJ-3"));

    const loaded = await CheckpointReader.load(filePath);
    expect(loaded.size).toBe(3);
    expect([...loaded.keys()]).toEqual(["PROJ-1", "PROJ-2", "PROJ-3"]);
  });

  it("returns empty Map when file does not exist", async () => {
    const loaded = await CheckpointReader.load(
      join(testDir, "does-not-exist.jsonl"),
    );
    expect(loaded.size).toBe(0);
  });

  it("records skipped clusters with reason", async () => {
    const filePath = join(testDir, "progress.jsonl");
    const writer = new CheckpointWriter(filePath);

    await writer.appendSkipped("PROJ-1", "Low confidence");

    const loaded = await CheckpointReader.load(filePath);
    expect(loaded.size).toBe(1);

    const entry = loaded.get("PROJ-1")!;
    expect(entry.skipped).toBe(true);
    expect(entry.reason).toBe("Low confidence");
    expect(entry.data).toBeUndefined();
  });

  it("atomic write: checkpoint file is valid JSONL after each write", async () => {
    const filePath = join(testDir, "progress.jsonl");
    const writer = new CheckpointWriter(filePath);

    await writer.append("PROJ-1", makeCluster("PROJ-1"));

    // The file should be valid JSONL
    const raw = await readFile(filePath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();

    await writer.append("PROJ-2", makeCluster("PROJ-2"));

    const raw2 = await readFile(filePath, "utf-8");
    const lines2 = raw2.trim().split("\n");
    expect(lines2).toHaveLength(2);
    for (const line of lines2) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("creates directories automatically if they do not exist", async () => {
    const filePath = join(testDir, "nested", "deep", "progress.jsonl");
    const writer = new CheckpointWriter(filePath);

    await writer.append("PROJ-1", makeCluster("PROJ-1"));

    const loaded = await CheckpointReader.load(filePath);
    expect(loaded.size).toBe(1);
  });

  it("skips malformed lines gracefully", async () => {
    const filePath = join(testDir, "progress.jsonl");
    const writer = new CheckpointWriter(filePath);

    await writer.append("PROJ-1", makeCluster("PROJ-1"));

    // Manually corrupt the file by appending garbage
    const { writeFile: wf } = await import("node:fs/promises");
    const existing = await readFile(filePath, "utf-8");
    await wf(filePath, existing + "not-valid-json\n", "utf-8");

    const loaded = await CheckpointReader.load(filePath);
    // Should still load the valid entry
    expect(loaded.size).toBe(1);
    expect(loaded.has("PROJ-1")).toBe(true);
  });
});
