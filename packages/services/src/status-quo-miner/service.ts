import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  CodeHealthReport,
  IsoTimestamp,
  Result,
  GitHotspot,
} from "@isv/domain";
import type { StaticAnalysisClient, GitClient } from "@isv/clients";
import type { WorkingTree } from "@isv/clients";

import type { StatusQuoMinerPort } from "./port.js";

// ---------------------------------------------------------------------------
// Entry-point detection (file-pattern search)
// ---------------------------------------------------------------------------

const CONTROLLER_PATTERNS = [
  /controller\./i,
  /resolver\./i,
  /\.controller\./i,
  /\.resolver\./i,
  /route\./i,
  /routes\./i,
];

const VIEW_PATTERNS = [
  /page\.(tsx|jsx|vue|svelte)$/i,
  /screen\.(tsx|jsx|vue|svelte)$/i,
  /view\.(tsx|jsx|vue|svelte)$/i,
];

async function countPatternFiles(
  directory: string,
  patterns: RegExp[],
): Promise<number> {
  let count = 0;
  try {
    const entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile()) {
        const name = entry.name;
        if (patterns.some((p) => p.test(name))) {
          count++;
        }
      }
    }
  } catch {
    // directory may not exist or be inaccessible
  }
  return count;
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of the Status Quo Miner.
 *
 * Iterates repos → calls StaticAnalysisClient.analyze() → detects
 * entry points → extracts Git hotspots → assembles CodeHealthReport.
 */
class StatusQuoMinerService implements StatusQuoMinerPort {
  private readonly staticAnalysis: StaticAnalysisClient;
  private readonly gitClient: GitClient | undefined;

  constructor(
    staticAnalysis: StaticAnalysisClient,
    gitClient?: GitClient,
  ) {
    this.staticAnalysis = staticAnalysis;
    this.gitClient = gitClient;
  }

  async mine(
    repos: WorkingTree[],
    timestamp: IsoTimestamp,
  ): Promise<Result<CodeHealthReport[]>> {
    try {
      const reports: CodeHealthReport[] = [];

      for (const repo of repos) {
        const { structuralFacts, healthScores } =
          await this.staticAnalysis.analyze(repo.workingDir);

        // Entry-point detection via file patterns
        const controllers = await countPatternFiles(
          repo.workingDir,
          CONTROLLER_PATTERNS,
        );
        const views = await countPatternFiles(repo.workingDir, VIEW_PATTERNS);

        // Git hotspot extraction
        let gitHotspots: GitHotspot[] = [];
        if (this.gitClient) {
          try {
            const stats = await this.gitClient.logStats(repo.repositoryId, {
              hotspotLimit: 50,
            });
            gitHotspots = stats.hotspots.map((h) => ({
              filePath: h.file,
              changeCount: h.changeCount,
            }));
          } catch {
            // Git stats may fail for some repos — continue without hotspots
          }
        }

        const report: CodeHealthReport = {
          repository: {
            repositoryId: repo.repositoryId,
          },
          timestamp,
          structuralFacts: {
            ...structuralFacts,
            entryPoints: { controllers, views },
            gitHotspots,
          },
          healthScores,
        };

        reports.push(report);
      }

      return { success: true, data: reports };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "STATUS_QUO_MINER_FAILED",
          message: err instanceof Error ? err.message : String(err),
          source: "status-quo-miner",
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export { countPatternFiles };
export { StatusQuoMinerService };
