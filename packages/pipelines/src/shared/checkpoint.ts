import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ShipUnitCluster } from "@isv/domain";

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
 * Writes are atomic: data is written to a temp file then renamed.
 */
export class CheckpointWriter {
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
   * Atomic append: read existing content, write to temp file, rename.
   * This ensures a crash mid-write never corrupts the checkpoint.
   */
  private async appendLine(line: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    let existing = "";
    try {
      existing = await readFile(this.filePath, "utf-8");
    } catch {
      // File doesn't exist yet — start fresh.
    }

    const content = existing + line + "\n";
    const tmpPath = this.filePath + ".tmp";
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, this.filePath);
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
