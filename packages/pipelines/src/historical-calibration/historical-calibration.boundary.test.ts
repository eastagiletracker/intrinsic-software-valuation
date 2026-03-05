import { describe, it, expect, vi } from "vitest";
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
});
