import type {
  Result,
  IsvFactors,
  RepositoryBaseline,
  SystemBaseline,
  ProjectConfig,
} from "@isv/domain";
import type { TicketClient, GitClient, LlmClient } from "@isv/clients";
import type {
  StatusQuoMinerPort,
  ArchitectureScannerPort,
  GapAnalyzerPort,
  ValuationPort,
} from "@isv/services";

import type { EnrichedIsvResult } from "./enriched-result.js";
import type { RepositoryPipelineResult } from "./enriched-result.js";
import type {
  IsvCalculationPipelinePort,
  IsvCalculationConfig,
  PipelineProgressCallback,
  PipelineProgressEvent,
} from "./port.js";
import { createLlmGate } from "../shared/llm-semaphore.js";

// ---------------------------------------------------------------------------
// Pipeline implementation
// ---------------------------------------------------------------------------

class IsvCalculationPipeline implements IsvCalculationPipelinePort {
  constructor(
    private readonly ticketClient: TicketClient,
    private readonly gitClient: GitClient,
    private readonly llmClient: LlmClient,
    private readonly statusQuoMiner: StatusQuoMinerPort,
    private readonly architectureScanner: ArchitectureScannerPort,
    private readonly gapAnalyzer: GapAnalyzerPort,
    private readonly valuation: ValuationPort,
  ) {}

  async run(
    ticketId: string,
    config: IsvCalculationConfig,
    onProgress?: PipelineProgressCallback,
    signal?: AbortSignal,
  ): Promise<Result<EnrichedIsvResult>> {
    /** Safely invoke the progress callback, swallowing any errors it throws. */
    const emit = (event: PipelineProgressEvent): void => {
      if (!onProgress) return;
      try {
        onProgress(event);
      } catch (e) {
        console.warn("[isv-pipeline] onProgress callback threw:", e);
      }
    };

    /** Check if the pipeline has been aborted and return early if so. */
    const checkAborted = (): Result<EnrichedIsvResult> | undefined => {
      if (signal?.aborted) {
        return {
          success: false,
          error: {
            code: "PIPELINE_ABORTED",
            message: "Pipeline was aborted (client disconnected).",
            source: "isv-calculation-pipeline",
          },
        };
      }
      return undefined;
    };

    try {
      const now = new Date().toISOString();
      const projectConfig: ProjectConfig = {
        d3QualityFloor: config.d3QualityFloor ?? 1,
        legacyDailyRate: 1000,
      };

      // Step 1: Fetch ticket + subtasks from Jira
      const ticketResult = await this.ticketClient.getTickets({
        mode: "withSubtasks",
        parentIds: [ticketId],
      });
      if (!ticketResult.success) return ticketResult;
      const allTickets = ticketResult.data;
      const ticket = allTickets.find((t) => t.ticketId === ticketId);
      if (!ticket) {
        return {
          success: false,
          error: {
            code: "TICKET_NOT_FOUND",
            message: `Ticket "${ticketId}" not found`,
            source: "isv-calculation-pipeline",
          },
        };
      }
      const subtasks = allTickets.filter((t) => t.parentId === ticketId);

      // totalSteps is unknown until we know how many repos there are.
      // Emit a preliminary event with totalSteps=0 (will be corrected after checkout).
      let completedSteps = 0;
      let totalSteps = 0;
      completedSteps++;
      const titlePreview = ticket.title.length > 30
        ? ticket.title.slice(0, 30) + "…"
        : ticket.title;
      const spLabel = ticket.storyPoints != null ? `, ${ticket.storyPoints} SP` : "";
      const subtaskLabel = subtasks.length > 0 ? `, ${subtasks.length} subtask(s)` : "";
      emit({
        step: "ticket-fetched",
        completedSteps,
        totalSteps,
        data: { ticket, subtasks },
        detail: `${ticket.ticketId} "${titlePreview}" (${ticket.type}${spLabel}${subtaskLabel})`,
      });

      // Step 2: Checkout repositories
      const repoIds =
        config.repositoryIds ?? this.gitClient.repositoryIds();
      const trees = await this.gitClient.checkoutAll(now);

      // Now we know the repo count: base 7 steps + repos for architecture-scanned
      totalSteps = 7 + repoIds.length;
      completedSteps++;
      emit({
        step: "repos-checked-out",
        completedSteps,
        totalSteps,
        data: { repositoryIds: repoIds },
        detail: repoIds.join(", "),
      });

      try {
        // ------------------------------------------------------------------
        // Parallel per-repo processing: mine + scan run concurrently per repo,
        // all repos processed simultaneously. LLM calls gated by semaphore.
        // ------------------------------------------------------------------

        const workingTrees = repoIds
          .filter((id) => trees.has(id))
          .map((id) => trees.get(id)!);

        const llmGate = createLlmGate(config.llmConcurrency ?? 5);

        // Wrap the LLM client so every invocation carries the abort signal.
        const signalledLlm: LlmClient = {
          prompt: (query) => this.llmClient.prompt({ ...query, signal }),
        };

        // Check abort before launching parallel work
        const abortedBeforeParallel = checkAborted();
        if (abortedBeforeParallel) return abortedBeforeParallel;

        // Process all repos in parallel: each repo mines + scans concurrently
        const perRepoResults = await Promise.all(
          workingTrees.map(async (tree) => {
            // Mine this single repo
            const mineResult = await this.statusQuoMiner.mine([tree], now);
            if (!mineResult.success) throw mineResult.error;
            const healthReport = mineResult.data[0];

            // Scan this repo (gated by LLM semaphore)
            const scanResult = await llmGate(() =>
              this.architectureScanner.scan(
                tree.workingDir,
                signalledLlm,
                tree.commitSha,
              ),
            );
            if (!scanResult.success) throw scanResult.error;

            return { tree, healthReport, systemContext: scanResult.data };
          }),
        );

        // --- Emit code-health-mined (barrier: all mining complete) ---
        const codeHealthReports = perRepoResults.map((r) => r.healthReport);

        completedSteps++;
        const coverages = codeHealthReports
          .map((r) => r.healthScores.testHealth.coveragePercentage)
          .filter((c): c is number => c != null);
        const avgCoverage = coverages.length > 0
          ? (coverages.reduce((a, b) => a + b, 0) / coverages.length).toFixed(0)
          : "n/a";
        const minedRepoNames = codeHealthReports.map((r) => r.repository.repositoryId).join(", ");
        emit({
          step: "code-health-mined",
          completedSteps,
          totalSteps,
          data: { codeHealthReports },
          detail: `${codeHealthReports.length} repo(s) [${minedRepoNames}] — avg coverage: ${avgCoverage}%`,
        });

        // --- Emit architecture-scanned per repo ---
        const repoBaselines: RepositoryBaseline[] = [];
        const repoPipelineResults: RepositoryPipelineResult[] = [];

        for (let i = 0; i < perRepoResults.length; i++) {
          const { tree, healthReport, systemContext } = perRepoResults[i];

          // Derive per-repo C2
          const c2State = this.valuation.deriveC2(healthReport.healthScores);

          repoBaselines.push({
            systemContext,
            codeHealthReport: healthReport,
            c2State,
          });

          repoPipelineResults.push({
            repositoryId: tree.repositoryId,
            codeHealthReport: healthReport,
            systemContext,
            c2State,
            provenance: {
              commitSha: tree.commitSha,
              commitDate: now,
            },
          });

          completedSteps++;
          emit({
            step: "architecture-scanned",
            completedSteps,
            totalSteps,
            data: {
              repositoryId: tree.repositoryId,
              systemContext,
              codeHealthReport: healthReport,
              c2State,
            },
            detail: `repo ${i + 1} of ${workingTrees.length} [${tree.repositoryId}]`,
          });
        }

        // Step 6: Assemble SystemBaseline
        const c2Values = repoBaselines
          .map((rb) => rb.c2State)
          .filter((c2): c2 is 1 | 2 | 3 => c2 !== undefined);
        const effectiveC2 =
          c2Values.length > 0 ? this.valuation.aggregateC2(c2Values) : 1;

        const systemBaseline: SystemBaseline = {
          timestamp: now,
          repositories: repoBaselines,
          effectiveC2,
        };

        const c2Label = effectiveC2 === 1 ? "clean" : effectiveC2 === 2 ? "moderate debt" : "toxic legacy";
        completedSteps++;
        emit({
          step: "c2-derived",
          completedSteps,
          totalSteps,
          data: { effectiveC2, repositories: repoPipelineResults },
          detail: `State Factor (technical debt) → C2 = ${effectiveC2} (${c2Label})`,
        });

        // Step 7: Gap Analyzer → GapAnalysisResult
        const abortedBeforeGap = checkAborted();
        if (abortedBeforeGap) return abortedBeforeGap;

        const gapResult = await this.gapAnalyzer.analyze(
          systemBaseline,
          ticket,
          projectConfig,
          signalledLlm,
        );
        if (!gapResult.success) return gapResult;

        completedSteps++;
        emit({
          step: "gap-analyzed",
          completedSteps,
          totalSteps,
          data: { gapAnalysis: gapResult.data },
        });

        // Step 8: Assemble IsvFactors
        const scoring = gapResult.data.isvScoring;
        const factors: IsvFactors = {
          A1_Data: scoring.A1_Data.score,
          A2_UX: scoring.A2_UX.score,
          B1_Logic: scoring.B1_Logic.score,
          C1_Integration: scoring.C1_Integration.score,
          C2_State: effectiveC2,
          D3_Quality: scoring.D3_Quality.score,
        };

        completedSteps++;
        emit({
          step: "factors-assembled",
          completedSteps,
          totalSteps,
          data: { factors },
        });

        // Step 9: Valuation → IsvResult
        const isvResult = this.valuation.calculate(ticketId, factors);

        // Assemble enriched result
        const enriched: EnrichedIsvResult = {
          ticket,
          pipelineResults: {
            repositories: repoPipelineResults,
            effectiveC2,
            gapAnalysis: gapResult.data,
          },
          isvResult,
          calibration: {
            storyPoints: ticket.storyPoints,
          },
        };

        completedSteps++;
        emit({
          step: "isv-calculated",
          completedSteps,
          totalSteps,
          data: { isvResult, calibration: enriched.calibration },
          detail: `ISV = ${isvResult.isvScore}`,
        });

        return { success: true, data: enriched };
      } finally {
        // Cleanup worktrees
        await this.gitClient.releaseAll();
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: "PIPELINE_FAILED",
          message:
            err instanceof Error
              ? err.message
              : typeof err === "object" && err !== null && "message" in err
                ? String((err as Record<string, unknown>).message)
                : JSON.stringify(err),
          source: "isv-calculation-pipeline",
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface IsvCalculationDeps {
  ticketClient: TicketClient;
  gitClient: GitClient;
  llmClient: LlmClient;
  statusQuoMiner: StatusQuoMinerPort;
  architectureScanner: ArchitectureScannerPort;
  gapAnalyzer: GapAnalyzerPort;
  valuation: ValuationPort;
}

/**
 * Create an ISV Calculation Pipeline.
 *
 * @param deps - All required service and client dependencies.
 * @returns A configured `IsvCalculationPipelinePort`.
 */
export function createIsvCalculationPipeline(
  deps: IsvCalculationDeps,
): IsvCalculationPipelinePort {
  return new IsvCalculationPipeline(
    deps.ticketClient,
    deps.gitClient,
    deps.llmClient,
    deps.statusQuoMiner,
    deps.architectureScanner,
    deps.gapAnalyzer,
    deps.valuation,
  );
}
