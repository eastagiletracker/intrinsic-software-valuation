import type {
  StructuralFacts,
  HealthScores,
  CodeHealthReport,
} from "@isv/domain";

/**
 * High-level static analysis client interface.
 *
 * Orchestrates calls to individual analysis tools (scc, jscpd, knip) and
 * assembles the results into domain types consumed by the Status Quo Miner.
 *
 * Services interact with this client — never with the underlying port or
 * CLI tools directly.
 */
export interface StaticAnalysisClient {
  /**
   * Run all configured analysis tools against a checked-out directory and
   * return the combined structural facts and health scores.
   *
   * @param directory - Absolute path to the repository working directory.
   * @returns Structural facts + health scores for the repository.
   */
  analyze(directory: string): Promise<{
    structuralFacts: StructuralFacts;
    healthScores: HealthScores;
  }>;
}
