import { execa } from "execa";

import type { KnipResult } from "./port.js";

/**
 * Raw knip JSON output shape (subset).
 */
interface KnipReport {
  readonly files: string[];
}

/**
 * Parse raw knip JSON output into a `KnipResult`.
 *
 * Exported for unit testing against fixtures.
 */
export function parseKnipOutput(json: string): KnipResult {
  const report: KnipReport = JSON.parse(json);
  return {
    deadCodeFiles: report.files.length,
  };
}

/**
 * Run `knip` on a directory and return dead-code metrics.
 *
 * @param directory - Absolute path to the repository working directory.
 * @returns Parsed `KnipResult`.
 */
export async function runKnip(directory: string): Promise<KnipResult> {
  const result = await execa("knip", ["--reporter", "json"], {
    cwd: directory,
  });
  return parseKnipOutput(result.stdout);
}
