import { access, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execa } from "execa";

import type { JscpdResult } from "./port.js";

/**
 * Raw jscpd JSON reporter output shape.
 */
interface JscpdReport {
  readonly statistics: {
    readonly total: {
      readonly lines: number;
      readonly sources: number;
      readonly clones: number;
      readonly duplicatedLines: number;
      readonly percentage: number;
    };
  };
}

/**
 * Parse raw jscpd JSON output into a `JscpdResult`.
 *
 * Exported for unit testing against fixtures.
 */
export function parseJscpdOutput(json: string): JscpdResult {
  const report: JscpdReport = JSON.parse(json);
  return {
    duplicationPercentage: report.statistics.total.percentage,
  };
}

/**
 * Run `jscpd` on a directory and return duplication metrics.
 *
 * jscpd v4 writes report files into a directory and exits with code 1 when
 * duplications are found, so we use a temporary output directory and tolerate
 * a non-zero exit code.
 *
 * @param directory - Absolute path to the repository working directory.
 * @returns Parsed `JscpdResult`.
 */
export async function runJscpd(directory: string): Promise<JscpdResult> {
  const outDir = join(tmpdir(), `jscpd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    // Verify the target directory exists before invoking jscpd
    await access(directory);

    await execa("jscpd", [
      directory,
      "--reporters",
      "json",
      "--output",
      outDir,
    ], { reject: false });

    const reportPath = join(outDir, "jscpd-report.json");

    // jscpd may not produce a report when the directory is empty or
    // contains too few analysable files. Return 0% duplication in that case.
    try {
      const json = await readFile(reportPath, "utf-8");
      return parseJscpdOutput(json);
    } catch {
      return { duplicationPercentage: 0 };
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
