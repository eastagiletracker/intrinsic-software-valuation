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
 * knip may prefix its JSON with non-JSON text (e.g. setup hints).
 * We extract the first JSON object/array from the output.
 *
 * Exported for unit testing against fixtures.
 */
export function parseKnipOutput(json: string): KnipResult {
  // Strip any non-JSON preamble: find the first '{' or '['
  const start = json.search(/[{[]/);
  if (start === -1) {
    return { deadCodeFiles: 0 };
  }
  const report: KnipReport = JSON.parse(json.slice(start));
  return {
    deadCodeFiles: report.files.length,
  };
}

/**
 * Run `knip` on a directory and return dead-code metrics.
 *
 * knip exits with code 1 when it finds unused files/exports, which is the
 * normal case for most projects. We tolerate non-zero exit codes and parse
 * the JSON output from stdout.
 *
 * @param directory - Absolute path to the repository working directory.
 * @returns Parsed `KnipResult`.
 */
export async function runKnip(directory: string): Promise<KnipResult> {
  const result = await execa("knip", ["--reporter", "json"], {
    cwd: directory,
    reject: false,
  });
  return parseKnipOutput(result.stdout);
}
