import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

import type { ShipUnitCluster } from "@isv/domain";

import { AsyncMutex } from "./async-mutex.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single checkpoint line for a completed cluster. */
export interface CheckpointEntry {
  clusterId: string;
  timestamp: string;
  skipped?: boolean;
  reason?: string;
  data?: ShipUnitCluster;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Append-only JSONL checkpoint writer.
 *
 * Each call to `append` writes one self-contained JSON line.
 * Writes are serialized via an async mutex to prevent concurrent
 * read-modify-write races. Each write uses a unique temp file name
 * as a secondary safeguard.
 */
export class CheckpointWriter {
  private readonly mutex = new AsyncMutex();

  constructor(private readonly filePath: string) {}

  /** Append a completed cluster to the checkpoint file. */
  async append(clusterId: string, data: ShipUnitCluster): Promise<void> {
    const entry: CheckpointEntry = {
      clusterId,
      timestamp: new Date().toISOString(),
      data,
    };
    await this.appendLine(JSON.stringify(entry));
  }

  /** Append a skipped cluster to the checkpoint file. */
  async appendSkipped(clusterId: string, reason: string): Promise<void> {
    const entry: CheckpointEntry = {
      clusterId,
      timestamp: new Date().toISOString(),
      skipped: true,
      reason,
    };
    await this.appendLine(JSON.stringify(entry));
  }

  /**
   * Atomic append: read existing content, write to unique temp file, rename.
   *
   * Serialized via mutex so concurrent callers execute one at a time.
   * Uses a random suffix on the temp file to prevent collisions even if
   * the mutex were somehow bypassed.
   */
  private appendLine(line: string): Promise<void> {
    return this.mutex.run(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });

      let existing = "";
      try {
        existing = await readFile(this.filePath, "utf-8");
      } catch {
        // File doesn't exist yet — start fresh.
      }

      const content = existing + line + "\n";
      const suffix = randomBytes(4).toString("hex");
      const tmpPath = `${this.filePath}.tmp.${suffix}`;
      try {
        await writeFile(tmpPath, content, "utf-8");
        await rename(tmpPath, this.filePath);
      } catch (err) {
        // Clean up the temp file on failure, then propagate.
        await rm(tmpPath, { force: true }).catch(() => {});
        throw err;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * JSONL checkpoint reader.
 *
 * Reads a checkpoint file and returns a Map of completed cluster entries.
 */
export class CheckpointReader {
  /**
   * Load checkpoint data from a JSONL file.
   *
   * @returns Map keyed by clusterId. Completed clusters have `data` populated;
   *          skipped clusters have `skipped: true`.
   */
  static async load(
    filePath: string,
  ): Promise<Map<string, CheckpointEntry>> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      // File does not exist — first run.
      return new Map();
    }

    const map = new Map<string, CheckpointEntry>();
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as CheckpointEntry;
        if (entry.clusterId) {
          map.set(entry.clusterId, entry);
        }
      } catch {
        // Skip malformed lines — be resilient.
      }
    }

    return map;
  }
}
