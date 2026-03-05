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
      };

      // Step 1: Fetch ticket from Jira
      const ticketResult = await this.ticketClient.getTickets({
        mode: "byTicketNumbers",
        ticketIds: [ticketId],
      });
      if (!ticketResult.success) return ticketResult;
      const tickets = ticketResult.data;
      if (tickets.length === 0) {
        return {
          success: false,
          error: {
            code: "TICKET_NOT_FOUND",
            message: `Ticket "${ticketId}" not found`,
            source: "isv-calculation-pipeline",
          },
        };
      }
      const ticket = tickets[0];

      // totalSteps is unknown until we know how many repos there are.
      // Emit a preliminary event with totalSteps=0 (will be corrected after checkout).
      let completedSteps = 0;
      let totalSteps = 0;
      completedSteps++;
      emit({ step: "ticket-fetched", completedSteps, totalSteps, data: { ticket } });

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
      });

      try {
        // Step 3: Status Quo Miner → CodeHealthReport[]
        const workingTrees = repoIds
          .filter((id) => trees.has(id))
          .map((id) => trees.get(id)!);

        const mineResult = await this.statusQuoMiner.mine(workingTrees, now);
        if (!mineResult.success) return mineResult;
        const codeHealthReports = mineResult.data;

        completedSteps++;
        emit({
          step: "code-health-mined",
          completedSteps,
          totalSteps,
          data: { codeHealthReports },
        });

        // Step 4: Architecture Scanner → SystemContext[] (one per repo)
        const repoBaselines: RepositoryBaseline[] = [];
        const repoPipelineResults: RepositoryPipelineResult[] = [];

        // Wrap the LLM client so every invocation carries the abort signal.
        const signalledLlm: LlmClient = {
          prompt: (query) => this.llmClient.prompt({ ...query, signal }),
        };

        for (let i = 0; i < workingTrees.length; i++) {
          const aborted = checkAborted();
          if (aborted) return aborted;

          const tree = workingTrees[i];
          const scanResult = await this.architectureScanner.scan(
            tree.workingDir,
            signalledLlm,
          );
          if (!scanResult.success) return scanResult;

          const healthReport =
            codeHealthReports.find(
              (r) => r.repository.repositoryId === tree.repositoryId,
            ) ?? codeHealthReports[i];

          // Step 5: Derive per-repo C2
          const c2State = this.valuation.deriveC2(healthReport.healthScores);

          repoBaselines.push({
            systemContext: scanResult.data,
            codeHealthReport: healthReport,
            c2State,
          });

          repoPipelineResults.push({
            repositoryId: tree.repositoryId,
            codeHealthReport: healthReport,
            systemContext: scanResult.data,
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
              systemContext: scanResult.data,
              codeHealthReport: healthReport,
              c2State,
            },
            detail: `repo ${i + 1} of ${workingTrees.length}`,
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

        completedSteps++;
        emit({
          step: "c2-derived",
          completedSteps,
          totalSteps,
          data: { effectiveC2, repositories: repoPipelineResults },
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
