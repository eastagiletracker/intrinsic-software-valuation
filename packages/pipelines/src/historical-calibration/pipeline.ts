import type {
  CalibrationResult,
  Result,
  ShipUnitCluster,
  IsvFactors,
  ProjectConfig,
} from "@isv/domain";
import type {
  TicketClient,
  GitClient,
  LlmClient,
  TimeTrackingClient,
} from "@isv/clients";
import type {
  StatusQuoMinerPort,
  ArchitectureScannerPort,
  GapAnalyzerPort,
  ValuationPort,
  CalibrationPort,
} from "@isv/services";

import type {
  HistoricalCalibrationPipelinePort,
  HistoricalCalibrationConfig,
} from "./port.js";

// ---------------------------------------------------------------------------
// Pipeline implementation
// ---------------------------------------------------------------------------

class HistoricalCalibrationPipeline
  implements HistoricalCalibrationPipelinePort
{
  constructor(
    private readonly ticketClient: TicketClient,
    private readonly gitClient: GitClient,
    private readonly llmClient: LlmClient,
    private readonly timeTrackingClient: TimeTrackingClient,
    private readonly statusQuoMiner: StatusQuoMinerPort,
    private readonly architectureScanner: ArchitectureScannerPort,
    private readonly gapAnalyzer: GapAnalyzerPort,
    private readonly valuation: ValuationPort,
    private readonly calibration: CalibrationPort,
  ) {}

  async run(
    config: HistoricalCalibrationConfig,
  ): Promise<Result<CalibrationResult>> {
    try {
      const projectConfig: ProjectConfig = {
        d3QualityFloor: config.d3QualityFloor ?? 1,
      };
      const minConfidence = config.minConfidence ?? 0.7;

      // Step 1: Load all tickets
      const ticketResult = await this.ticketClient.getTickets({
        mode: "all",
      });
      if (!ticketResult.success) return ticketResult;
      const tickets = ticketResult.data;

      if (tickets.length === 0) {
        return {
          success: false,
          error: {
            code: "NO_TICKETS",
            message: "No tickets found for calibration",
            source: "historical-calibration-pipeline",
          },
        };
      }

      // Step 2: Cluster tickets
      const ticketClusters = this.calibration.clusterTickets(tickets);

      // Step 3: Load time entries
      const timeSheet = await this.timeTrackingClient.getTimeSheet();
      const timeEntries = timeSheet.entries;

      // Step 4: Attribute time to clusters
      const attributed = this.calibration.attributeTime(
        timeEntries,
        ticketClusters,
      );

      // Step 5: Calculate DQS
      const dqs = this.calibration.calculateDqs(attributed);

      // Step 6: For each cluster, run fact finding + gap analysis + valuation
      const shipUnitClusters: ShipUnitCluster[] = [];
      const skippedClusters: string[] = [];

      for (const [clusterId, clusterTickets] of ticketClusters) {
        try {
          const primaryTicket = clusterTickets[0];
          // T0 derivation: use ticket creation date as proxy
          const timestampT0 = primaryTicket.createdAt;

          // Checkout repos at T0
          const trees = await this.gitClient.checkoutAll(timestampT0);

          try {
            const repoIds = this.gitClient.repositoryIds();
            const workingTrees = repoIds
              .filter((id: string) => trees.has(id))
              .map((id: string) => trees.get(id)!);

            if (workingTrees.length === 0) {
              skippedClusters.push(clusterId);
              continue;
            }

            // Status Quo Miner
            const mineResult = await this.statusQuoMiner.mine(
              workingTrees,
              timestampT0,
            );
            if (!mineResult.success) {
              skippedClusters.push(clusterId);
              continue;
            }

            // Architecture Scanner (first repo)
            const scanResult = await this.architectureScanner.scan(
              workingTrees[0].workingDir,
              this.llmClient,
            );
            if (!scanResult.success) {
              skippedClusters.push(clusterId);
              continue;
            }

            // Derive C2
            const c2 = this.valuation.deriveC2(
              mineResult.data[0].healthScores,
            );

            // Assemble SystemBaseline
            const systemBaseline = {
              timestamp: timestampT0,
              repositories: mineResult.data.map((report) => ({
                systemContext: scanResult.data,
                codeHealthReport: report,
                c2State: c2,
              })),
              effectiveC2: c2,
            };

            // Gap Analyzer
            const gapResult = await this.gapAnalyzer.analyze(
              systemBaseline,
              primaryTicket,
              projectConfig,
              this.llmClient,
            );
            if (!gapResult.success) {
              skippedClusters.push(clusterId);
              continue;
            }

            // Confidence gate
            if (gapResult.data.meta.confidenceScore < minConfidence) {
              skippedClusters.push(clusterId);
              continue;
            }

            // Assemble IsvFactors
            const scoring = gapResult.data.isvScoring;
            const factors: IsvFactors = {
              A1_Data: scoring.A1_Data.score,
              A2_UX: scoring.A2_UX.score,
              B1_Logic: scoring.B1_Logic.score,
              C1_Integration: scoring.C1_Integration.score,
              C2_State: c2,
              D3_Quality: scoring.D3_Quality.score,
            };

            // Valuation
            const isvResult = this.valuation.calculate(clusterId, factors);

            // Calculate time for this cluster
            const clusterHours = attributed
              .filter((a) => a.attributedClusterId === clusterId)
              .reduce((sum, a) => sum + a.attributedHours, 0);

            // Git changes aggregation
            let locAdded = 0;
            let locDeleted = 0;
            let filesChanged = 0;
            for (const tree of workingTrees) {
              try {
                const stats = await this.gitClient.logStats(
                  tree.repositoryId,
                  { since: timestampT0 },
                );
                locAdded += stats.linesAdded;
                locDeleted += stats.linesDeleted;
                filesChanged += stats.filesChanged;
              } catch {
                // skip on failure
              }
            }

            const shipUnit: ShipUnitCluster = {
              clusterId,
              ids: clusterTickets.map((t) => t.ticketId),
              metadata: {
                type: primaryTicket.type,
                storyPoints: primaryTicket.storyPoints,
                timestampT0,
              },
              isvAnalysis: {
                formulaVersion: isvResult.formulaVersion,
                isvScore: isvResult.isvScore,
                confidence: gapResult.data.meta.confidenceScore,
                factors: isvResult.factors,
                breakdown: isvResult.breakdown,
              },
              metrics: {
                totalHours: clusterHours,
                gitChanges: {
                  locAdded,
                  locDeleted,
                  filesChanged,
                  distributionEntropy: 0,
                  cyclomaticComplexityDelta: 0,
                  changeIntensityScore: 0,
                },
              },
            };

            shipUnitClusters.push(shipUnit);
          } finally {
            await this.gitClient.releaseAll();
          }
        } catch {
          skippedClusters.push(clusterId);
        }
      }

      // Step 7: Run calibration regression
      if (shipUnitClusters.length < 2) {
        return {
          success: false,
          error: {
            code: "INSUFFICIENT_CLUSTERS",
            message: `Only ${shipUnitClusters.length} valid clusters (${skippedClusters.length} skipped). Need at least 2.`,
            source: "historical-calibration-pipeline",
          },
        };
      }

      const calibrationResult =
        this.calibration.calibrate(shipUnitClusters);
      if (!calibrationResult.success) return calibrationResult;

      // Override DQS with the actual calculated value
      return {
        success: true,
        data: {
          ...calibrationResult.data,
          dataQualityScore: dqs,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "PIPELINE_FAILED",
          message: err instanceof Error ? err.message : String(err),
          source: "historical-calibration-pipeline",
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface HistoricalCalibrationDeps {
  ticketClient: TicketClient;
  gitClient: GitClient;
  llmClient: LlmClient;
  timeTrackingClient: TimeTrackingClient;
  statusQuoMiner: StatusQuoMinerPort;
  architectureScanner: ArchitectureScannerPort;
  gapAnalyzer: GapAnalyzerPort;
  valuation: ValuationPort;
  calibration: CalibrationPort;
}

/**
 * Create a Historical Calibration Pipeline.
 *
 * @param deps - All required service and client dependencies.
 * @returns A configured `HistoricalCalibrationPipelinePort`.
 */
export function createHistoricalCalibrationPipeline(
  deps: HistoricalCalibrationDeps,
): HistoricalCalibrationPipelinePort {
  return new HistoricalCalibrationPipeline(
    deps.ticketClient,
    deps.gitClient,
    deps.llmClient,
    deps.timeTrackingClient,
    deps.statusQuoMiner,
    deps.architectureScanner,
    deps.gapAnalyzer,
    deps.valuation,
    deps.calibration,
  );
}
