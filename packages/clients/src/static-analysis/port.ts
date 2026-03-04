import type { CodeHealthReport } from "@isv/domain";

// ---------------------------------------------------------------------------
// Tool result types
// ---------------------------------------------------------------------------

/** Volume and complexity metrics from scc. */
export interface SccResult {
  /** Total lines of code (excluding blanks and comments). */
  readonly totalLinesOfCode: number;
  /** Absolute number of source code files. */
  readonly totalFiles: number;
  /** Average cyclomatic complexity across all source files. */
  readonly avgCyclomaticComplexity: number;
  /** Number of files exceeding 1 000 lines of code. */
  readonly godClassCount: number;
}

/** Duplication metrics from jscpd. */
export interface JscpdResult {
  /** Percentage of duplicated code blocks (0–100). */
  readonly duplicationPercentage: number;
}

/** Dead-code metrics from Knip. */
export interface KnipResult {
  /** Number of dead / unused code files detected. */
  readonly deadCodeFiles: number;
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

/**
 * Source-agnostic port for static analysis tool adapters.
 *
 * Each method wraps one external CLI tool (scc, jscpd, knip) and returns
 * a typed result. The port is consumed exclusively by the
 * `StaticAnalysisClient` — services never use it directly.
 */
export interface StaticAnalysisPort {
  /** Run `scc` on the given directory and return volume + complexity metrics. */
  scc(directory: string): Promise<SccResult>;

  /** Run `jscpd` on the given directory and return duplication metrics. */
  jscpd(directory: string): Promise<JscpdResult>;

  /** Run `knip` on the given directory and return dead-code metrics. */
  knip(directory: string): Promise<KnipResult>;
}
