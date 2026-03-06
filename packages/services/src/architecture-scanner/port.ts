import type { SystemContext, Result } from "@isv/domain";
import type { LlmClient } from "@isv/clients";

/**
 * Architecture Scanner service port.
 *
 * Phase 1 (qualitative): uses an LLM to extract structured architecture
 * information from a codebase.
 */
export interface ArchitectureScannerPort {
  /**
   * Scan a repository and produce a SystemContext.
   *
   * @param workingDir - Absolute path to the checked-out repository.
   * @param llm - LLM client for prompt-based analysis.
   * @param commitSha - Optional commit SHA; when provided, implementations
   *   may use it as a cache key to avoid redundant LLM calls.
   * @returns A structured SystemContext validated against the domain schema.
   */
  scan(workingDir: string, llm: LlmClient, commitSha?: string): Promise<Result<SystemContext>>;
}
