import type { StructuralFacts, HealthScores } from "@isv/domain";

import type { StaticAnalysisClient } from "./client.js";
import type { StaticAnalysisPort, SccResult, JscpdResult, KnipResult } from "./port.js";
import { CliStaticAnalysisAdapter } from "./cli-static-analysis.adapter.js";

// ---------------------------------------------------------------------------
// Mapping helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Map raw tool results to `StructuralFacts`.
 *
 * Entry points (controllers, views, routes) are NOT populated by static
 * analysis — they are detected by the Status Quo Miner via file-system
 * pattern matching.
 */
export function mapStructuralFacts(scc: SccResult): StructuralFacts {
  return {
    volume: {
      totalLinesOfCode: scc.totalLinesOfCode,
      totalFiles: scc.totalFiles,
    },
    entryPoints: {
      controllers: 0,
      views: 0,
    },
    gitHotspots: [],
  };
}

/**
 * Map raw tool results to `HealthScores`.
 */
export function mapHealthScores(
  scc: SccResult,
  jscpd: JscpdResult,
  knip: KnipResult,
): HealthScores {
  return {
    complexity: {
      avgCyclomaticComplexity: scc.avgCyclomaticComplexity,
      duplicationPercentage: jscpd.duplicationPercentage,
      godClassCount: scc.godClassCount,
    },
    testHealth: {
      coveragePercentage: undefined,
      outdatedDependencies: 0,
      deadCodeFiles: knip.deadCodeFiles,
    },
  };
}

// ---------------------------------------------------------------------------
// DefaultStaticAnalysisClient
// ---------------------------------------------------------------------------

class DefaultStaticAnalysisClient implements StaticAnalysisClient {
  private readonly port: StaticAnalysisPort;

  constructor(port: StaticAnalysisPort) {
    this.port = port;
  }

  async analyze(
    directory: string,
  ): Promise<{ structuralFacts: StructuralFacts; healthScores: HealthScores }> {
    const [scc, jscpd, knip] = await Promise.all([
      this.port.scc(directory),
      this.port.jscpd(directory),
      this.port.knip(directory),
    ]);

    return {
      structuralFacts: mapStructuralFacts(scc),
      healthScores: mapHealthScores(scc, jscpd, knip),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ready-to-use `StaticAnalysisClient`.
 *
 * @param port - Optional custom port implementation for testing.
 *               Defaults to the CLI adapter wrapping scc/jscpd/knip.
 * @returns A `StaticAnalysisClient` instance.
 */
export function createStaticAnalysisClient(
  port?: StaticAnalysisPort,
): StaticAnalysisClient {
  return new DefaultStaticAnalysisClient(port ?? new CliStaticAnalysisAdapter());
}
