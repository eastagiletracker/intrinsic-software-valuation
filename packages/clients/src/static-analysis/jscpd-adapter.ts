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
 * @param directory - Absolute path to the repository working directory.
 * @returns Parsed `JscpdResult`.
 */
export async function runJscpd(directory: string): Promise<JscpdResult> {
  const result = await execa("jscpd", [
    directory,
    "--reporters",
    "json",
    "--output",
    "/dev/stdout",
  ]);
  return parseJscpdOutput(result.stdout);
}
