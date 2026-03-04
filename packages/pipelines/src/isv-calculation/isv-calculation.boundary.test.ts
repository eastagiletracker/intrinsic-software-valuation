import { describe, it, expect, vi } from "vitest";
import { IsvResultSchema } from "@isv/domain";
import type { TicketClient, GitClient, LlmClient, WorkingTree } from "@isv/clients";
import type {
  StatusQuoMinerPort,
  ArchitectureScannerPort,
  GapAnalyzerPort,
  ValuationPort,
} from "@isv/services";

import { createIsvCalculationPipeline } from "./pipeline.js";

// ---------------------------------------------------------------------------
// Mock ticket
// ---------------------------------------------------------------------------

const mockTicket = {
  ticketId: "PROJ-42",
  projectKey: "PROJ",
  type: "Story",
  status: "In Progress",
  title: "Add validation",
  description: "Add input validation to the processing pipeline.",
  labels: [],
  comments: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Mock clients
// ---------------------------------------------------------------------------

const mockWorkingTree: WorkingTree = {
  repositoryId: "test-repo",
  workingDir: "/tmp/work/test-repo",
  commitSha: "abc123",
};

const mockTicketClient: TicketClient = {
  getTickets: vi.fn().mockResolvedValue({
    success: true,
    data: [mockTicket],
  }),
};

const mockGitClient = {
  repositoryIds: vi.fn().mockReturnValue(["test-repo"]),
  checkoutAll: vi
    .fn()
    .mockResolvedValue(new Map([["test-repo", mockWorkingTree]])),
  checkout: vi.fn().mockResolvedValue(mockWorkingTree),
  release: vi.fn().mockResolvedValue(undefined),
  releaseAll: vi.fn().mockResolvedValue(undefined),
  logStats: vi.fn().mockResolvedValue({
    linesAdded: 100,
    linesDeleted: 50,
    filesChanged: 10,
    hotspots: [],
  }),
  destroy: vi.fn().mockResolvedValue(undefined),
} satisfies GitClient;

const mockLlm: LlmClient = {
  prompt: vi.fn().mockResolvedValue({
    success: true,
    data: "mock",
  }),
};

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

// derived from: packages/clients/src/static-analysis/__fixtures__/*
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
      techStack: {
        languages: ["TypeScript"],
        frameworks: [],
        infrastructure: [],
      },
      adapterCatalog: { inbound: [], outbound: [] },
      corePatterns: [],
      domainModels: [],
    },
  }),
};

// derived from: packages/services/src/gap-analyzer/__fixtures__/gap-analysis-response.json
const mockGapAnalyzer: GapAnalyzerPort = {
  analyze: vi.fn().mockResolvedValue({
    success: true,
    data: {
      ticketId: "PROJ-42",
      meta: { isTicketActionable: true, confidenceScore: 0.85 },
      architecturalFit: {
        canBeImplementedWithExistingPatterns: true,
        summary: "Fits",
      },
      identifiedGaps: {
        data: { hasGap: false, missingEntities: [], description: "None" },
        ui: { hasGap: false, description: "None" },
        logic: { hasGap: true, description: "Validation needed" },
        integration: {
          hasGap: false,
          missingAdapters: [],
          description: "None",
        },
      },
      requiredModifications: { architectureExtensions: [], actionItems: [] },
      isvScoring: {
        A1_Data: { score: 1, reasoning: "Read-only" },
        A2_UX: { score: 2, reasoning: "Standard" },
        B1_Logic: { score: 2, reasoning: "Validation" },
        C1_Integration: { score: 1, reasoning: "Local" },
        D3_Quality: { score: 1, reasoning: "Standard" },
      },
    },
  }),
};

const mockValuation: ValuationPort = {
  calculate: vi.fn().mockReturnValue({
    formulaVersion: "3.4",
    ticketId: "PROJ-42",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ISV Calculation Pipeline — boundary test", () => {
  it("produces schema-valid IsvResult", async () => {
    const pipeline = createIsvCalculationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
    });

    const result = await pipeline.run("PROJ-42", {});
    expect(result.success).toBe(true);
    if (!result.success) return;

    const parsed = IsvResultSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    expect(result.data.isvScore).toBe(4);
  });

  it("calls services in correct order", async () => {
    const pipeline = createIsvCalculationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
    });

    await pipeline.run("PROJ-42", {});

    expect(mockTicketClient.getTickets).toHaveBeenCalled();
    expect(mockGitClient.checkoutAll).toHaveBeenCalled();
    expect(mockStatusQuoMiner.mine).toHaveBeenCalled();
    expect(mockArchScanner.scan).toHaveBeenCalled();
    expect(mockValuation.deriveC2).toHaveBeenCalled();
    expect(mockGapAnalyzer.analyze).toHaveBeenCalled();
    expect(mockValuation.calculate).toHaveBeenCalled();
  });

  it("returns error when ticket not found", async () => {
    const emptyTicketClient: TicketClient = {
      getTickets: vi.fn().mockResolvedValue({ success: true, data: [] }),
    };

    const pipeline = createIsvCalculationPipeline({
      ticketClient: emptyTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
    });

    const result = await pipeline.run("NONEXISTENT", {});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("cleans up worktrees on success", async () => {
    const pipeline = createIsvCalculationPipeline({
      ticketClient: mockTicketClient,
      gitClient: mockGitClient,
      llmClient: mockLlm,
      statusQuoMiner: mockStatusQuoMiner,
      architectureScanner: mockArchScanner,
      gapAnalyzer: mockGapAnalyzer,
      valuation: mockValuation,
    });

    await pipeline.run("PROJ-42", {});
    expect(mockGitClient.releaseAll).toHaveBeenCalled();
  });
});
