import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalibrationRunOutputSchema } from "@isv/domain";
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

import { createHistoricalCalibrationPipeline } from "./pipeline.js";
import type { CalibrationProgressEvent } from "./progress.js";
import { CheckpointWriter, CheckpointReader } from "../shared/checkpoint.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockTickets = [
  {
    ticketId: "PROJ-1",
    projectKey: "PROJ",
    type: "Story",
    status: "Done",
    title: "Feature A",
    description: "Feature A description",
    labels: [],
    comments: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-02-01T00:00:00.000Z",
  },
  {
    ticketId: "PROJ-2",
    projectKey: "PROJ",
    type: "Story",
    status: "Done",
    title: "Feature B",
    description: "Feature B description",
    labels: [],
    comments: [],
    createdAt: "2025-02-01T00:00:00.000Z",
    updatedAt: "2025-03-01T00:00:00.000Z",
  },
];

const mockWorkingTree: WorkingTree = {
  repositoryId: "test-repo",
  workingDir: "/tmp/work/test-repo",
  commitSha: "abc123",
};

// ---------------------------------------------------------------------------
// Mock clients
// ---------------------------------------------------------------------------

const mockTicketClient: TicketClient = {
  getTickets: vi.fn().mockResolvedValue({
    success: true,
    data: mockTickets,
  }),
};

const mockGitClient = {
  repositoryIds: vi.fn().mockReturnValue(["test-repo"]),
  checkoutAll: vi
    .fn()
    .mockResolvedValue(new Map([["test-repo", mockWorkingTree]])),
  checkout: vi.fn(),
  release: vi.fn(),
  releaseAll: vi.fn().mockResolvedValue(undefined),
  logStats: vi.fn().mockResolvedValue({
    linesAdded: 100,
    linesDeleted: 50,
    filesChanged: 10,
    hotspots: [],
  }),
  destroy: vi.fn(),
} satisfies GitClient;

const mockLlm: LlmClient = {
  prompt: vi.fn().mockResolvedValue({ success: true, data: "mock" }),
};

const mockTimeTrackingClient: TimeTrackingClient = {
  getTimeSheet: vi.fn().mockResolvedValue({
    periodStart: "2025-01-01T00:00:00.000Z",
    periodEnd: "2025-06-01T00:00:00.000Z",
    sourceSystem: "test",
    rawEntryCount: 2,
    entries: [
      {
        timestamp: "2025-01-15T09:00:00.000Z",
        durationHours: 16,
        rawComment: "PROJ-1 work",
        detectedIds: ["PROJ-1"],
        attributionType: "DIRECT",
      },
      {
        timestamp: "2025-02-15T09:00:00.000Z",
        durationHours: 40,
        rawComment: "PROJ-2 work",
        detectedIds: ["PROJ-2"],
        attributionType: "DIRECT",
      },
    ],
  }),
};

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockStatusQuoMiner: StatusQuoMinerPort = {
  mine: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        repository: { repositoryId: "test-repo" },
        timestamp: "2025-01-01T00:00:00.000Z",
        structuralFacts: {
          volume: { totalLinesOfCode: 10000, totalFiles: 100 },
          entryPoints: { controllers: 5, views: 0 },
          gitHotspots: [],
        },
        healthScores: {
          complexity: {
            avgCyclomaticComplexity: 3,
            duplicationPercentage: 2,
            godClassCount: 0,
          },
          testHealth: {
            coveragePercentage: 80,
            outdatedDependencies: 0,
            deadCodeFiles: 0,
          },
        },
      },
    ],
  }),
};

const mockArchScanner: ArchitectureScannerPort = {
  scan: vi.fn().mockResolvedValue({
    success: true,
    data: {
      repository: { repositoryId: "test-repo" },
      systemArchetype: "BACKEND_SERVICE",
      archetypeReasoning: "Test",
      techStack: { languages: ["TS"], frameworks: [], infrastructure: [] },
      adapterCatalog: { inbound: [], outbound: [] },
      corePatterns: [],
      domainModels: [],
    },
  }),
};

const mockGapAnalyzer: GapAnalyzerPort = {
  analyze: vi.fn().mockResolvedValue({
    success: true,
    data: {
      ticketId: "PROJ-1",
      meta: { isTicketActionable: true, confidenceScore: 0.85 },
      architecturalFit: {
        canBeImplementedWithExistingPatterns: true,
        summary: "Fits",
      },
      identifiedGaps: {
        data: { hasGap: false, missingEntities: [], description: "None" },
        ui: { hasGap: false, description: "None" },
        logic: { hasGap: false, description: "None" },
        integration: {
          hasGap: false,
          missingAdapters: [],
          description: "None",
        },
      },
      requiredModifications: { architectureExtensions: [], actionItems: [] },
      isvScoring: {
        A1_Data: { score: 1, reasoning: "R" },
        A2_UX: { score: 2, reasoning: "R" },
        B1_Logic: { score: 2, reasoning: "R" },
        C1_Integration: { score: 1, reasoning: "R" },
        D3_Quality: { score: 1, reasoning: "R" },
      },
    },
  }),
};

const mockValuation: ValuationPort = {
  calculate: vi.fn().mockReturnValue({
    formulaVersion: "3.4",
    ticketId: "PROJ-1",
    factors: {
      A1_Data: 1,
      A2_UX: 2,
      B1_Logic: 2,
      C1_Integration: 1,
      C2_State: 1,
      D3_Quality: 1,
    },
    breakdown: { poValue: 4, archFactor: 1, qualityMultiplier: 1 },
    isvScore: 4,
  }),
  deriveC2: vi.fn().mockReturnValue(1),
  aggregateC2: vi.fn().mockReturnValue(1),
};

const mockCalibration: CalibrationPort = {
  clusterTickets: vi.fn().mockReturnValue(
    new Map([
      ["PROJ-1", [mockTickets[0]]],
      ["PROJ-2", [mockTickets[1]]],
    ]),
  ),
  attributeTime: vi.fn().mockReturnValue([
    {
      timestamp: "2025-01-15T09:00:00.000Z",
      originalDurationHours: 16,
      attributedClusterId: "PROJ-1",
      attributedHours: 16,
      attributionReason: "Direct match",
    },
    {
      timestamp: "2025-02-15T09:00:00.000Z",
      originalDurationHours: 40,
      attributedClusterId: "PROJ-2",
      attributedHours: 40,
      attributionReason: "Direct match",
    },
  ]),
  calculateDqs: vi.fn().mockReturnValue(1.0),
  calibrate: vi.fn().mockReturnValue({
    success: true,
    data: {
      formulaVersion: "3.4",
      shipRateHoursPerIsv: 4.0,
      shipRateExclOutliers: 4.0,
      rSquared: 0.95,
      adjustedRSquared: 0.94,
      dataQualityScore: 1.0,
      sampleSize: 2,
      periodStart: "2025-01-01T00:00:00.000Z",
      periodEnd: "2025-02-01T00:00:00.000Z",
      factorDiagnostics: [
        {
          feature: "A1_Data",
          partialCorrelation: 0.5,
          weight: 1.2,
          pValue: 0.03,
        },
        {
          feature: "A2_UX",
          partialCorrelation: 0.3,
          weight: 0.8,
          pValue: 0.1,
        },
        {
          feature: "B1_Logic",
          partialCorrelation: 0.4,
          weight: 1.0,
          pValue: 0.05,
        },
        {
          feature: "C1_Integration",
          partialCorrelation: 0.2,
          weight: 0.5,
          pValue: 0.2,
        },
        {
          feature: "C2_State",
          partialCorrelation: 0.1,
          weight: 0.3,
          pValue: 0.5,
        },
        {
          feature: "D3_Quality",
          partialCorrelation: 0.15,
          weight: 0.4,
          pValue: 0.3,
        },
        {
          feature: "distributionEntropy",
          partialCorrelation: 0.35,
          weight: 0.9,
          pValue: 0.07,
        },
        {
          feature: "cyclomaticComplexityDelta",
          partialCorrelation: 0.25,
          weight: 0.6,
          pValue: 0.15,
        },
        {
          feature: "changeIntensityScore",
          partialCorrelation: 0.2,
          weight: 0.5,
          pValue: 0.2,
        },
      ],
      reliability: {
        sampleSize: 2,
        effectiveSampleSize: 2,
        standardError: 0.5,
        confidenceInterval95: { lower: 3.0, upper: 5.0 },
        coefficientOfVariation: 0.125,
        dataQualityScore: 1.0,
        normalityFlag: "pass",
      },
      outliers: {
        outlierCount: 0,
        outlierPercentage: 0,
        entries: [],
      },
      normalityAssessment: {
        testName: "shapiro-wilk",
        testStatistic: 0.95,
        pValue: 0.6,
        skewness: 0.1,
        kurtosis: -0.2,
        flag: "pass",
      },
      formulaValidation: {
        fitAssessment: "strong",
        shipRateReliability: "Ship Rate is statistically reliable",
        dataQualityAssessment: "Data quality is good",
        factorRanking: [
          {
            feature: "A1_Data",
            absPartialCorrelation: 0.5,
            isSignificant: true,
          },
        ],
        mismatches: {
          multiplicativeFactorsWithLowWeight: [],
          additiveFactorsWithDominantWeight: [],
          gitMetricsOutperformingIsv: false,
        },
        recommendations: [],
      },
    },
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Historical Calibration Pipeline — boundary test", () => {
  // Reset mocks between tests to prevent state leakage
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default mock implementations after clearing
    (mockTicketClient.getTickets as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockTickets,
    });
    (mockGitClient.repositoryIds as ReturnType<typeof vi.fn>).mockReturnValue(["test-repo"]);
    (mockGitClient.checkoutAll as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([["test-repo", mockWorkingTree]]),
    );
    (mockGitClient.release as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (mockGitClient.releaseAll as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (mockGitClient.logStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      linesAdded: 100,
      linesDeleted: 50,
      filesChanged: 10,
      hotspots: [],
    });
  });
  it("produces schema-valid CalibrationRunOutput", async () => {
    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    const result = await pipeline.run({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    const parsed = CalibrationRunOutputSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.result.shipRateHoursPerIsv).toBeGreaterThan(0);
    expect(result.data.clusters).toBeDefined();
    expect(result.data.residuals).toBeDefined();
    expect(result.data.skippedClusters).toBeDefined();
  });

  it("passes timeframe to ticket and time-tracking clients", async () => {
    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    await pipeline.run({ periodStart: "2025-01", periodEnd: "2025-06" });

    expect(mockTicketClient.getTickets).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "all",
        timeframe: expect.objectContaining({
          start: expect.any(String),
          end: expect.any(String),
        }),
      }),
    );
    expect(mockTimeTrackingClient.getTimeSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        timeframe: expect.objectContaining({
          start: expect.any(String),
          end: expect.any(String),
        }),
      }),
    );
  });

  it("calls all services in orchestration order", async () => {
    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    await pipeline.run({});

    expect(mockTicketClient.getTickets).toHaveBeenCalled();
    expect(mockCalibration.clusterTickets).toHaveBeenCalled();
    expect(mockTimeTrackingClient.getTimeSheet).toHaveBeenCalled();
    expect(mockCalibration.attributeTime).toHaveBeenCalled();
    expect(mockStatusQuoMiner.mine).toHaveBeenCalled();
    expect(mockArchScanner.scan).toHaveBeenCalled();
    expect(mockGapAnalyzer.analyze).toHaveBeenCalled();
    expect(mockValuation.calculate).toHaveBeenCalled();
    expect(mockCalibration.calibrate).toHaveBeenCalled();
  });

  it("returns error when no tickets found", async () => {
    const emptyTicketClient: TicketClient = {
      getTickets: vi.fn().mockResolvedValue({ success: true, data: [] }),
    };

    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: emptyTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    const result = await pipeline.run({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NO_TICKETS");
  });

  it("reports skipped clusters with reasons", async () => {
    const failingGapAnalyzer: GapAnalyzerPort = {
      analyze: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: "ANALYSIS_FAILED",
          message: "Gap analysis failed",
          source: "gap-analyzer",
        },
      }),
    };

    // Need at least 2 clusters to succeed, but if all fail we get INSUFFICIENT_CLUSTERS
    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: failingGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    const result = await pipeline.run({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INSUFFICIENT_CLUSTERS");
  });

  // -------------------------------------------------------------------------
  // AC-5.4 — Per-cluster release
  // -------------------------------------------------------------------------

  it("calls release() per-tree instead of releaseAll() in the happy path", async () => {
    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    const result = await pipeline.run({});
    expect(result.success).toBe(true);

    // release() should be called once per cluster (2 clusters × 1 tree each)
    expect(mockGitClient.release).toHaveBeenCalledTimes(2);
    expect(mockGitClient.release).toHaveBeenCalledWith(mockWorkingTree);

    // releaseAll() should NOT be called in the happy path
    expect(mockGitClient.releaseAll).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC-3.7 — Progress callback
  // -------------------------------------------------------------------------

  it("emits onProgress events in correct order with consistent current/total", async () => {
    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    const events: CalibrationProgressEvent[] = [];
    const result = await pipeline.run({
      onProgress: (event) => events.push(event),
    });

    expect(result.success).toBe(true);

    // Expect pipeline phases + cluster events + complete
    const phases = events.map((e) => e.phase);

    // Pipeline phases should be in order
    expect(phases[0]).toBe("loading-tickets");
    expect(phases[1]).toBe("clustering");
    expect(phases[2]).toBe("loading-time-entries");
    expect(phases[3]).toBe("attributing-time");
    expect(phases[4]).toBe("calculating-dqs");

    // Cluster events
    const clusterEvents = events.filter(
      (e) => e.phase === "processing-cluster",
    );
    expect(clusterEvents.length).toBe(4); // 2 clusters × 2 events (processing + completed)

    // Last events should be regression and complete
    expect(phases[phases.length - 2]).toBe("regression");
    expect(phases[phases.length - 1]).toBe("complete");
  });

  it("does not crash when onProgress callback throws", async () => {
    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    const result = await pipeline.run({
      onProgress: () => {
        throw new Error("callback error");
      },
    });

    // Pipeline should still succeed despite callback errors
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // AC-2.11 — Checkpoint resume
  // -------------------------------------------------------------------------

  it("resumes from a partial checkpoint and produces complete output", async () => {
    const runId = `test-resume-${Date.now()}`;
    const checkpointPath = `data/default/calibration-runs/${runId}/progress.jsonl`;

    // Write a checkpoint entry for PROJ-1 (simulating a partial previous run)
    const writer = new CheckpointWriter(checkpointPath);
    await writer.append("PROJ-1", {
      clusterId: "PROJ-1",
      ids: ["PROJ-1"],
      metadata: {
        type: "Story",
        timestampT0: "2025-01-01T00:00:00.000Z",
      },
      isvAnalysis: {
        formulaVersion: "3.4",
        isvScore: 4,
        confidence: 0.85,
        factors: {
          A1_Data: 1,
          A2_UX: 2,
          B1_Logic: 2,
          C1_Integration: 1,
          C2_State: 1,
          D3_Quality: 1,
        },
        breakdown: { poValue: 4, archFactor: 1, qualityMultiplier: 1 },
      },
      metrics: {
        totalHours: 16,
        gitChanges: {
          locAdded: 100,
          locDeleted: 50,
          filesChanged: 10,
          distributionEntropy: 0,
          cyclomaticComplexityDelta: 3,
          changeIntensityScore: 0.4,
        },
      },
    });

    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
    });

    const events: CalibrationProgressEvent[] = [];
    const result = await pipeline.run({
      runId,
      onProgress: (event) => events.push(event),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Should have 2 clusters in the output
    expect(result.data.clusters).toHaveLength(2);

    // PROJ-1 should have been restored from checkpoint
    const restoredEvents = events.filter((e) => e.status === "restored");
    expect(restoredEvents).toHaveLength(1);
    expect(restoredEvents[0].clusterId).toBe("PROJ-1");

    // PROJ-2 should have been processed fresh
    const completedEvents = events.filter((e) => e.status === "completed");
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0].clusterId).toBe("PROJ-2");

    // Only PROJ-2's checkout should have happened (PROJ-1 was restored)
    expect(mockGitClient.checkoutAll).toHaveBeenCalledTimes(1);

    // Clean up
    const { rm } = await import("node:fs/promises");
    await rm(`data/default/calibration-runs/${runId}`, {
      recursive: true,
      force: true,
    });
  });

  // -------------------------------------------------------------------------
  // AC-1.8 — Concurrent processing via PQueue
  // -------------------------------------------------------------------------

  it("processes clusters concurrently with configurable concurrency", async () => {
    // Create mock with 4 clusters to observe concurrency
    const fourTickets = [
      ...mockTickets,
      {
        ticketId: "PROJ-3",
        projectKey: "PROJ",
        type: "Story",
        status: "Done",
        title: "Feature C",
        description: "Feature C description",
        labels: [],
        comments: [],
        createdAt: "2025-03-01T00:00:00.000Z",
        updatedAt: "2025-04-01T00:00:00.000Z",
      },
      {
        ticketId: "PROJ-4",
        projectKey: "PROJ",
        type: "Story",
        status: "Done",
        title: "Feature D",
        description: "Feature D description",
        labels: [],
        comments: [],
        createdAt: "2025-04-01T00:00:00.000Z",
        updatedAt: "2025-05-01T00:00:00.000Z",
      },
    ];

    const fourClusterTicketClient: TicketClient = {
      getTickets: vi.fn().mockResolvedValue({
        success: true,
        data: fourTickets,
      }),
    };

    const fourClusterCalibration: CalibrationPort = {
      ...mockCalibration,
      clusterTickets: vi.fn().mockReturnValue(
        new Map([
          ["PROJ-1", [fourTickets[0]]],
          ["PROJ-2", [fourTickets[1]]],
          ["PROJ-3", [fourTickets[2]]],
          ["PROJ-4", [fourTickets[3]]],
        ]),
      ),
      attributeTime: vi.fn().mockReturnValue([
        {
          timestamp: "2025-01-15T09:00:00.000Z",
          originalDurationHours: 16,
          attributedClusterId: "PROJ-1",
          attributedHours: 16,
          attributionReason: "Direct match",
        },
        {
          timestamp: "2025-02-15T09:00:00.000Z",
          originalDurationHours: 40,
          attributedClusterId: "PROJ-2",
          attributedHours: 40,
          attributionReason: "Direct match",
        },
        {
          timestamp: "2025-03-15T09:00:00.000Z",
          originalDurationHours: 20,
          attributedClusterId: "PROJ-3",
          attributedHours: 20,
          attributionReason: "Direct match",
        },
        {
          timestamp: "2025-04-15T09:00:00.000Z",
          originalDurationHours: 30,
          attributedClusterId: "PROJ-4",
          attributedHours: 30,
          attributionReason: "Direct match",
        },
      ]),
      calibrate: vi.fn().mockReturnValue(
        mockCalibration.calibrate([]),
      ),
    };

    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: fourClusterTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: fourClusterCalibration,
    });

    const processedIds: string[] = [];
    const result = await pipeline.run({
      concurrency: 2,
      onProgress: (event) => {
        if (
          event.phase === "processing-cluster" &&
          (event.status === "completed" || event.status === "skipped")
        ) {
          processedIds.push(event.clusterId!);
        }
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // All 4 clusters should produce results (completion order is non-deterministic)
    expect(result.data.clusters).toHaveLength(4);
    const clusterIds = result.data.clusters.map((c) => c.clusterId).sort();
    expect(clusterIds).toEqual(["PROJ-1", "PROJ-2", "PROJ-3", "PROJ-4"]);
  });

  // -------------------------------------------------------------------------
  // AC-6.6 — Pipeline with RunStore
  // -------------------------------------------------------------------------

  it("uses RunStore for state persistence when provided", async () => {
    const { mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { SqliteRunStore } = await import("../shared/sqlite-run-store.js");

    const testRunId = `test-store-${Date.now()}`;
    const dbPath = join("/tmp", `test-store-${Date.now()}.db`);
    const store = new SqliteRunStore(dbPath);

    const pipeline = createHistoricalCalibrationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      timeTrackingClient: mockTimeTrackingClient,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
      calibration: mockCalibration,
      runStore: store,
    });

    const result = await pipeline.run({
      runId: testRunId,
      concurrency: 1,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      store.close();
      return;
    }

    // Verify RunStore state
    const run = store.getRun(testRunId);
    expect(run).toBeDefined();
    expect(run!.status).toBe("completed");
    expect(run!.result).toBeDefined();

    // Verify cluster state
    const doneClusters = store.getClustersByStatus(testRunId, "done");
    expect(doneClusters).toHaveLength(2);

    store.close();

    // Clean up
    rmSync(dbPath, { force: true });
    rmSync(dbPath + "-wal", { force: true });
    rmSync(dbPath + "-shm", { force: true });
  });
});
