import { execa } from "execa";

import type { SccResult } from "./port.js";

/**
 * Raw scc JSON output entry (one per language).
 */
interface SccLanguageEntry {
  readonly Name: string;
  readonly Lines: number;
  readonly Code: number;
  readonly Comment: number;
  readonly Blank: number;
  readonly Complexity: number;
  readonly Count: number;
  readonly Files: unknown[];
}

/**
 * Parse raw scc JSON output into an `SccResult`.
 *
 * Exported for unit testing against fixtures.
 */
export function parseSccOutput(json: string): SccResult {
  const entries: SccLanguageEntry[] = JSON.parse(json);

  let totalLinesOfCode = 0;
  let totalFiles = 0;
  let totalComplexity = 0;
  let godClassCount = 0;

  for (const entry of entries) {
    totalLinesOfCode += entry.Code;
    totalFiles += entry.Count;
    totalComplexity += entry.Complexity;

    // God classes: files exceeding 1000 lines of code
    if (Array.isArray(entry.Files)) {
      for (const file of entry.Files) {
        const f = file as { Code?: number };
        if (f.Code !== undefined && f.Code > 1000) {
          godClassCount++;
        }
      }
    }
  }

  const avgCyclomaticComplexity =
    totalFiles > 0 ? totalComplexity / totalFiles : 0;

  return {
    totalLinesOfCode,
    totalFiles,
    avgCyclomaticComplexity,
    godClassCount,
  };
}

/**
 * Run `scc` on a directory and return volume + complexity metrics.
 *
 * @param directory - Absolute path to the repository working directory.
 * @returns Parsed `SccResult`.
 */
export async function runScc(directory: string): Promise<SccResult> {
  const result = await execa("scc", ["--format", "json", directory]);
  return parseSccOutput(result.stdout);
}
