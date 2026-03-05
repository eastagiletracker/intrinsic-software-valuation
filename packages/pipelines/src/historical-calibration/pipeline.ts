import PQueue from "p-queue";

import type {
  CalibrationRunOutput,
  ClusterResidual,
  Result,
  ShipUnitCluster,
  IsvFactors,
  ProjectConfig,
  Ticket,
} from "@isv/domain";
import type {
  TicketClient,
  GitClient,
  LlmClient,
  TimeTrackingClient,
  WorkingTree,
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
import type {
  CalibrationProgressEvent,
  CalibrationProgressCallback,
} from "./progress.js";
import { retryAsync } from "../shared/retry.js";
import {
  CheckpointWriter,
  CheckpointReader,
} from "../shared/checkpoint.js";
import { createLlmGate, type LlmGate } from "../shared/llm-semaphore.js";
import type { RunStore } from "../shared/run-store.port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the last moment of the last day of the given month.
 * Uses the Date.UTC day-0 trick: month+1, day 0 → last day of current month.
 */
function lastMomentOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
}

/**
 * Resolve periodStart/periodEnd from config, defaulting to an 18-month
 * window ending at the current month.
 */
function resolvePeriod(config: HistoricalCalibrationConfig): {
  start: string;
  end: string;
} {
  const now = new Date();
  const endDate = config.periodEnd
    ? new Date(config.periodEnd + "-01T00:00:00.000Z")
    : lastMomentOfMonth(now.getUTCFullYear(), now.getUTCMonth());

  const startDate = config.periodStart
    ? new Date(config.periodStart + "-01T00:00:00.000Z")
    : new Date(
        Date.UTC(
          endDate.getUTCFullYear(),
          endDate.getUTCMonth() - 18,
          1,
          0,
          0,
          0,
        ),
      );

  // For the end, use last moment of the last day of the month
  const endOfMonth = config.periodEnd
    ? lastMomentOfMonth(endDate.getUTCFullYear(), endDate.getUTCMonth())
    : endDate;

  return {
    start: startDate.toISOString(),
    end: endOfMonth.toISOString(),
  };
}

/**
 * Compute Shannon entropy of lines-changed-per-file distribution.
 */
function computeDistributionEntropy(
  hotspots: Array<{ file: string; changeCount: number }>,
): number {
  if (hotspots.length === 0) return 0;
  const values = hotspots.map((h) => h.changeCount);
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const v of values) {
    if (v > 0) {
      const p = v / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/**
 * Compute change intensity score (0-1).
 */
function computeChangeIntensityScore(
  locTotal: number,
  entropy: number,
  complexityDelta: number,
): number {
  const locNorm = Math.min(locTotal / 10000, 1);
  const entropyNorm = Math.min(entropy / 5, 1);
  const complexityNorm = Math.min(Math.abs(complexityDelta) / 50, 1);
  return Math.max(
    0,
    Math.min(1, 0.4 * locNorm + 0.3 * entropyNorm + 0.3 * complexityNorm),
  );
}

/**
 * Generate a default run ID from the current timestamp with a random suffix
 * to ensure uniqueness even when multiple runs start in the same second.
 */
function generateRunId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cal-${ts}-${rand}`;
}

/**
 * Resolve the checkpoint file path for a calibration run.
 */
function resolveCheckpointPath(
  projectSlug: string | undefined,
  runId: string,
): string {
  const slug = projectSlug ?? "default";
  return `data/${slug}/calibration-runs/${runId}/progress.jsonl`;
}

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
    private readonly runStore?: RunStore,
  ) {}

  async run(
    config: HistoricalCalibrationConfig,
  ): Promise<Result<CalibrationRunOutput>> {
    /** Safely invoke the progress callback, swallowing any errors it throws. */
    const emit = (event: CalibrationProgressEvent): void => {
      if (!config.onProgress) return;
      try {
        config.onProgress(event);
      } catch (e) {
        console.warn("[calibration-pipeline] onProgress callback threw:", e);
      }
    };

    // Checkpoint setup
    const runId = config.runId ?? generateRunId();
    const checkpointPath = resolveCheckpointPath(config.projectSlug, runId);
    const checkpointWriter = new CheckpointWriter(checkpointPath);

    // RunStore setup
    const store = this.runStore;
    if (store) {
      const existingRun = store.getRun(runId);
      if (!existingRun) {
        store.createRun({
          runId,
          projectSlug: config.projectSlug,
          periodStart: config.periodStart,
          periodEnd: config.periodEnd,
          concurrency: config.concurrency,
          llmConcurrency: config.llmConcurrency,
        });
      }
      store.updateRunStatus(runId, "running");
    }

    // LLM semaphore
    const llmGate = createLlmGate(config.llmConcurrency ?? 2);

    try {
      const projectConfig: ProjectConfig = {
        d3QualityFloor: config.d3QualityFloor ?? 1,
      };
      const minConfidence = config.minConfidence ?? 0.7;

      // Resolve period
      const period = resolvePeriod(config);

      // Step 1: Load tickets (with optional timeframe filter)
      emit({ phase: "loading-tickets", current: 1, total: 7 });
      const ticketResult = await this.ticketClient.getTickets({
        mode: "all",
        timeframe: { start: period.start, end: period.end },
      });
      if (!ticketResult.success) {
        if (store) store.updateRunStatus(runId, "failed");
        return ticketResult;
      }
      const tickets = ticketResult.data;

      if (tickets.length === 0) {
        if (store) store.updateRunStatus(runId, "failed");
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
      emit({ phase: "clustering", current: 2, total: 7 });
      const ticketClusters = this.calibration.clusterTickets(tickets);

      // Step 3: Load time entries (with timeframe filter)
      emit({ phase: "loading-time-entries", current: 3, total: 7 });
      const timeSheet = await this.timeTrackingClient.getTimeSheet({
        timeframe: { start: period.start, end: period.end },
      });
      const timeEntries = timeSheet.entries;

      // Step 4: Attribute time to clusters
      emit({ phase: "attributing-time", current: 4, total: 7 });
      const attributed = this.calibration.attributeTime(
        timeEntries,
        ticketClusters,
      );

      // Step 5: Calculate DQS
      emit({ phase: "calculating-dqs", current: 5, total: 7 });
      const dqs = this.calibration.calculateDqs(attributed);

      // Step 6: For each cluster, run fact finding + gap analysis + valuation
      const shipUnitClusters: ShipUnitCluster[] = [];
      const skippedClusters: Array<{ clusterId: string; reason: string }> = [];

      // Load checkpoint for resume (JSONL as secondary; RunStore as primary when available)
      const checkpoint = await CheckpointReader.load(checkpointPath);

      const clusterEntries = [...ticketClusters];
      const totalClusters = clusterEntries.length;

      // Register clusters in RunStore
      if (store) {
        store.createClusters(
          runId,
          clusterEntries.map(([id]) => id),
        );
      }

      // --- Concurrent processing via PQueue ---
      const concurrency = config.concurrency ?? 3;
      const taskTimeoutMs = config.taskTimeoutMs ?? 300_000; // 5 min

      const queue = new PQueue({
        concurrency,
        timeout: taskTimeoutMs,
      });

      // SIGINT handling: pause queue, let in-flight tasks finish
      let sigintReceived = false;
      const sigintHandler = () => {
        sigintReceived = true;
        queue.pause();
      };
      process.on("SIGINT", sigintHandler);

      // Track cluster index for progress (atomic counter)
      let completedCount = 0;

      const clusterTasks = clusterEntries.map(
        ([clusterId, clusterTickets]) => {
          return queue.add(async () => {
            // If SIGINT was received, skip remaining clusters
            if (sigintReceived) return;

            // Check RunStore for resume first, then fall back to JSONL checkpoint
            if (store) {
              const existing = store.getCluster(runId, clusterId);
              if (existing && existing.status === "done" && existing.data) {
                shipUnitClusters.push(existing.data);
                completedCount++;
                emit({
                  phase: "processing-cluster",
                  current: completedCount,
                  total: totalClusters,
                  clusterId,
                  status: "restored",
                  detail: "Restored from store",
                });
                return;
              }
              if (
                existing &&
                (existing.status === "failed" || existing.status === "skipped")
              ) {
                skippedClusters.push({
                  clusterId,
                  reason: existing.error ?? "Previously failed/skipped",
                });
                completedCount++;
                emit({
                  phase: "processing-cluster",
                  current: completedCount,
                  total: totalClusters,
                  clusterId,
                  status: "skipped",
                  detail: "Restored from store (skipped)",
                });
                return;
              }
            } else {
              // Fall back to JSONL checkpoint
              const existingEntry = checkpoint.get(clusterId);
              if (existingEntry) {
                if (existingEntry.skipped) {
                  skippedClusters.push({
                    clusterId,
                    reason: existingEntry.reason ?? "Previously skipped",
                  });
                } else if (existingEntry.data) {
                  shipUnitClusters.push(existingEntry.data);
                }
                completedCount++;
                emit({
                  phase: "processing-cluster",
                  current: completedCount,
                  total: totalClusters,
                  clusterId,
                  status: existingEntry.skipped ? "skipped" : "restored",
                  detail: existingEntry.skipped
                    ? "Restored from checkpoint (skipped)"
                    : "Restored from checkpoint",
                });
                return;
              }
            }

            // Mark cluster as running in store
            if (store) store.updateCluster(runId, clusterId, "running");

            emit({
              phase: "processing-cluster",
              current: completedCount + 1,
              total: totalClusters,
              clusterId,
              status: "processing",
            });

            try {
              const result = await this.processCluster(
                clusterId,
                clusterTickets,
                projectConfig,
                minConfidence,
                attributed,
                llmGate,
              );

              completedCount++;

              if (result.skipped) {
                skippedClusters.push({
                  clusterId,
                  reason: result.reason!,
                });
                await checkpointWriter.appendSkipped(
                  clusterId,
                  result.reason!,
                );
                if (store) {
                  store.updateCluster(
                    runId,
                    clusterId,
                    "skipped",
                    undefined,
                    result.reason,
                  );
                }
                emit({
                  phase: "processing-cluster",
                  current: completedCount,
                  total: totalClusters,
                  clusterId,
                  status: "skipped",
                  detail: result.reason,
                });
              } else {
                shipUnitClusters.push(result.data!);
                await checkpointWriter.append(clusterId, result.data!);
                if (store) {
                  store.updateCluster(
                    runId,
                    clusterId,
                    "done",
                    result.data,
                  );
                }
                emit({
                  phase: "processing-cluster",
                  current: completedCount,
                  total: totalClusters,
                  clusterId,
                  status: "completed",
                });
              }
            } catch (err) {
              completedCount++;
              const reason =
                err instanceof Error
                  ? err.message
                  : "Unexpected error during cluster processing";
              skippedClusters.push({ clusterId, reason });
              await checkpointWriter.appendSkipped(clusterId, reason);
              if (store) {
                store.updateCluster(
                  runId,
                  clusterId,
                  "failed",
                  undefined,
                  reason,
                );
              }
              emit({
                phase: "processing-cluster",
                current: completedCount,
                total: totalClusters,
                clusterId,
                status: "skipped",
                detail: reason,
              });
            }
          });
        },
      );

      // Wait for all tasks. Using allSettled instead of all so that
      // individual task rejections (e.g. timeout) don't abort the queue —
      // each task already handles its own errors via the try/catch inside.
      await Promise.allSettled(clusterTasks);

      // If SIGINT was received, wait for any in-flight tasks then exit
      if (sigintReceived) {
        await queue.onIdle();
        process.removeListener("SIGINT", sigintHandler);
        if (store) store.updateRunStatus(runId, "failed");
        return {
          success: false,
          error: {
            code: "PIPELINE_INTERRUPTED",
            message: "Pipeline interrupted by SIGINT. State persisted.",
            source: "historical-calibration-pipeline",
          },
        };
      }

      process.removeListener("SIGINT", sigintHandler);

      // Step 7: Run calibration regression
      emit({ phase: "regression", current: 6, total: 7 });
      if (shipUnitClusters.length < 2) {
        if (store) store.updateRunStatus(runId, "failed");
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
      if (!calibrationResult.success) {
        if (store) store.updateRunStatus(runId, "failed");
        return calibrationResult;
      }

      // Override DQS with the actual calculated value
      const result = {
        ...calibrationResult.data,
        dataQualityScore: dqs,
      };
      result.reliability = {
        ...result.reliability,
        dataQualityScore: dqs,
      };

      // Build per-cluster residuals from calibration output.
      // Use the simple Ship Rate model (y = shipRate * isvScore) for
      // per-cluster predicted values, consistent with the scalar Ship Rate.
      const outlierIds = new Set(
        result.outliers.entries.map((e) => e.clusterId),
      );
      const rawResiduals = shipUnitClusters.map((c) => {
        const predicted =
          result.shipRateHoursPerIsv * c.isvAnalysis.isvScore;
        return c.metrics.totalHours - predicted;
      });
      const residualVariance =
        rawResiduals.length > 1
          ? rawResiduals.reduce((sum, r) => sum + r * r, 0) /
            (rawResiduals.length - 1)
          : 0;
      const residualStdDev = Math.sqrt(residualVariance);

      const residuals: ClusterResidual[] = shipUnitClusters.map((c, i) => {
        const predicted =
          result.shipRateHoursPerIsv * c.isvAnalysis.isvScore;
        const residual = rawResiduals[i];
        const stdResidual =
          residualStdDev > 0 ? residual / residualStdDev : 0;

        return {
          clusterId: c.clusterId,
          actualHours: c.metrics.totalHours,
          predictedHours: predicted,
          residual,
          standardizedResidual: stdResidual,
          isOutlier: outlierIds.has(c.clusterId),
        };
      });

      const output: CalibrationRunOutput = {
        result,
        clusters: shipUnitClusters,
        residuals,
        skippedClusters,
      };

      // Persist completed run
      if (store) store.completeRun(runId, output);

      emit({ phase: "complete", current: 7, total: 7 });

      return { success: true, data: output };
    } catch (err) {
      // Safety last-resort cleanup
      await this.gitClient.releaseAll();
      if (store) {
        try {
          store.updateRunStatus(runId, "failed");
        } catch {
          // Ignore store errors during cleanup
        }
      }
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

  // -----------------------------------------------------------------------
  // Per-cluster processing (extracted for PQueue tasks)
  // -----------------------------------------------------------------------

  private async processCluster(
    clusterId: string,
    clusterTickets: Ticket[],
    projectConfig: ProjectConfig,
    minConfidence: number,
    attributed: Array<{
      attributedClusterId?: string;
      attributedHours: number;
      [key: string]: unknown;
    }>,
    llmGate: LlmGate,
  ): Promise<{
    skipped?: boolean;
    reason?: string;
    data?: ShipUnitCluster;
  }> {
    const primaryTicket = clusterTickets[0];
    // T0 derivation: use ticket creation date as proxy
    const timestampT0 = primaryTicket.createdAt;

    // Checkout repos at T0 — retryable (external I/O)
    const trees = await retryAsync(
      () => this.gitClient.checkoutAll(timestampT0),
    );

    // Collect trees for per-cluster release
    const checkedOutTrees: WorkingTree[] = [];

    try {
      const repoIds = this.gitClient.repositoryIds();
      const workingTrees = repoIds
        .filter((id: string) => trees.has(id))
        .map((id: string) => trees.get(id)!);

      // Track trees for cleanup
      checkedOutTrees.push(...workingTrees);

      if (workingTrees.length === 0) {
        return {
          skipped: true,
          reason: "No working trees available for checkout",
        };
      }

      // Status Quo Miner
      const mineResult = await this.statusQuoMiner.mine(
        workingTrees,
        timestampT0,
      );
      if (!mineResult.success) {
        return {
          skipped: true,
          reason: `Status Quo Miner failed: ${mineResult.error.message}`,
        };
      }

      // Architecture Scanner (first repo) — retryable (LLM I/O), gated
      const scanResult = await llmGate(() =>
        retryAsync(() =>
          this.architectureScanner.scan(
            workingTrees[0].workingDir,
            this.llmClient,
          ),
        ),
      );
      if (!scanResult.success) {
        return {
          skipped: true,
          reason: `Architecture Scanner failed: ${scanResult.error.message}`,
        };
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

      // Gap Analyzer — retryable (LLM I/O), gated
      const gapResult = await llmGate(() =>
        retryAsync(() =>
          this.gapAnalyzer.analyze(
            systemBaseline,
            primaryTicket,
            projectConfig,
            this.llmClient,
          ),
        ),
      );
      if (!gapResult.success) {
        return {
          skipped: true,
          reason: `Gap Analyzer failed: ${gapResult.error.message}`,
        };
      }

      // Confidence gate
      if (gapResult.data.meta.confidenceScore < minConfidence) {
        return {
          skipped: true,
          reason: `Low confidence: ${gapResult.data.meta.confidenceScore} < ${minConfidence}`,
        };
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

      // Valuation (pure computation — not retried)
      const isvResult = this.valuation.calculate(clusterId, factors);

      // Calculate time for this cluster
      const clusterHours = attributed
        .filter((a) => a.attributedClusterId === clusterId)
        .reduce((sum, a) => sum + a.attributedHours, 0);

      // Git changes aggregation
      let locAdded = 0;
      let locDeleted = 0;
      let filesChanged = 0;
      let allHotspots: Array<{
        file: string;
        changeCount: number;
      }> = [];
      for (const tree of workingTrees) {
        try {
          const stats = await this.gitClient.logStats(
            tree.repositoryId,
            { since: timestampT0 },
          );
          locAdded += stats.linesAdded;
          locDeleted += stats.linesDeleted;
          filesChanged += stats.filesChanged;
          if (stats.hotspots) {
            allHotspots = allHotspots.concat(stats.hotspots);
          }
        } catch {
          // skip on failure
        }
      }

      // Compute Git change metrics
      const distributionEntropy =
        computeDistributionEntropy(allHotspots);
      const cyclomaticComplexityDelta = Math.round(
        (locAdded - locDeleted) * 0.05,
      );
      const intensityScore = computeChangeIntensityScore(
        locAdded + locDeleted,
        distributionEntropy,
        cyclomaticComplexityDelta,
      );

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
            distributionEntropy,
            cyclomaticComplexityDelta,
            changeIntensityScore: intensityScore,
          },
        },
      };

      return { data: shipUnit };
    } finally {
      // Per-cluster release: release only this cluster's trees
      for (const tree of checkedOutTrees) {
        await this.gitClient.release(tree);
      }
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
  /** Optional RunStore for persistence. When omitted, JSONL checkpoint is used. */
  runStore?: RunStore;
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
    deps.runStore,
  );
}
