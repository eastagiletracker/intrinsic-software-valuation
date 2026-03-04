import type {
  GapAnalysisResult,
  SystemBaseline,
  Ticket,
  ProjectConfig,
  Result,
} from "@isv/domain";
import type { LlmClient } from "@isv/clients";

/**
 * Gap Analyzer service port.
 *
 * Phase 2: compares a ticket (target state) with the system baseline
 * (current state) and produces structured ISV factor scores.
 */
export interface GapAnalyzerPort {
  /**
   * Analyze the gap between current system state and a ticket's requirements.
   *
   * @param baseline - System baseline from Fact Finder (phase 1).
   * @param ticket - The ticket to analyze.
   * @param config - Project configuration (e.g. D3 quality floor).
   * @param llm - LLM client for prompt-based analysis.
   * @returns A structured GapAnalysisResult with ISV factor scores.
   */
  analyze(
    baseline: SystemBaseline,
    ticket: Ticket,
    config: ProjectConfig,
    llm: LlmClient,
  ): Promise<Result<GapAnalysisResult>>;
}
