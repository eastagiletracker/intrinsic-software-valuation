import { describe, it, expect, vi } from "vitest";
import { CodeHealthReportSchema } from "@isv/domain";
import type { StaticAnalysisClient, GitClient, WorkingTree } from "@isv/clients";

import { createStatusQuoMiner } from "./factory.js";

// derived from: packages/clients/src/static-analysis/__fixtures__/scc-output.json
const mockStructuralFacts = {
  volume: { totalLinesOfCode: 13200, totalFiles: 180 },
  entryPoints: { controllers: 0, views: 0 },
  gitHotspots: [],
};

// derived from: packages/clients/src/static-analysis/__fixtures__/*-output.json
const mockHealthScores = {
  complexity: {
    avgCyclomaticComplexity: 3.5,
    duplicationPercentage: 5.0,
    godClassCount: 0,
  },
  testHealth: {
    coveragePercentage: undefined,
    outdatedDependencies: 0,
    deadCodeFiles: 3,
  },
};

const mockStaticAnalysis: StaticAnalysisClient = {
  analyze: vi.fn().mockResolvedValue({
    structuralFacts: mockStructuralFacts,
    healthScores: mockHealthScores,
  }),
};

const mockGitClient = {
  repositoryIds: vi.fn().mockReturnValue(["test-repo"]),
  checkoutAll: vi.fn(),
  checkout: vi.fn(),
  release: vi.fn(),
  releaseAll: vi.fn(),
  logStats: vi.fn().mockResolvedValue({
    linesAdded: 500,
    linesDeleted: 200,
    filesChanged: 30,
    hotspots: [
      { file: "src/index.ts", changeCount: 42 },
      { file: "src/utils.ts", changeCount: 20 },
    ],
  }),
  destroy: vi.fn(),
  resolveAllCommitShas: vi.fn().mockResolvedValue(new Map()),
} satisfies GitClient;

const testRepo: WorkingTree = {
  repositoryId: "test-repo",
  workingDir: "/tmp/test-working-dir",
  commitSha: "abc123",
};

describe("Status Quo Miner — boundary test", () => {
  it("produces schema-valid CodeHealthReport from mocked clients", async () => {
    const miner = createStatusQuoMiner(mockStaticAnalysis, mockGitClient);
    const result = await miner.mine([testRepo], "2025-01-01T00:00:00.000Z");

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(1);
    const report = result.data[0];

    // Validate against domain schema
    const parsed = CodeHealthReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it("calls StaticAnalysisClient.analyze() for each repo", async () => {
    const miner = createStatusQuoMiner(mockStaticAnalysis, mockGitClient);
    await miner.mine([testRepo], "2025-01-01T00:00:00.000Z");

    expect(mockStaticAnalysis.analyze).toHaveBeenCalledWith(
      testRepo.workingDir,
    );
  });

  it("calls GitClient.logStats() for hotspot extraction", async () => {
    const miner = createStatusQuoMiner(mockStaticAnalysis, mockGitClient);
    await miner.mine([testRepo], "2025-01-01T00:00:00.000Z");

    expect(mockGitClient.logStats).toHaveBeenCalledWith(
      testRepo.repositoryId,
      { hotspotLimit: 50 },
    );
  });

  it("maps git hotspots into CodeHealthReport", async () => {
    const miner = createStatusQuoMiner(mockStaticAnalysis, mockGitClient);
    const result = await miner.mine([testRepo], "2025-01-01T00:00:00.000Z");

    expect(result.success).toBe(true);
    if (!result.success) return;

    const report = result.data[0];
    expect(report.structuralFacts.gitHotspots).toHaveLength(2);
    expect(report.structuralFacts.gitHotspots[0].filePath).toBe("src/index.ts");
    expect(report.structuralFacts.gitHotspots[0].changeCount).toBe(42);
  });

  it("works without GitClient (hotspots empty)", async () => {
    const miner = createStatusQuoMiner(mockStaticAnalysis);
    const result = await miner.mine([testRepo], "2025-01-01T00:00:00.000Z");

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data[0].structuralFacts.gitHotspots).toHaveLength(0);
  });

  it("returns error Result on StaticAnalysisClient failure", async () => {
    const failingAnalysis: StaticAnalysisClient = {
      analyze: vi.fn().mockRejectedValue(new Error("scc not found")),
    };
    const miner = createStatusQuoMiner(failingAnalysis);
    const result = await miner.mine([testRepo], "2025-01-01T00:00:00.000Z");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("STATUS_QUO_MINER_FAILED");
  });
});
