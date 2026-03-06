import { describe, it, expect, vi } from "vitest";
import { createArchitectureScanner, createStatusQuoMiner } from "@isv/services";

import { createHistoricalCalibrationFromConfig } from "./config-factory.js";

// ---------------------------------------------------------------------------
// Mock all client factories
// ---------------------------------------------------------------------------

vi.mock("@isv/clients", () => ({
  createTicketClient: vi.fn().mockResolvedValue({
    getTickets: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getTicketsByTimeframe: vi.fn().mockResolvedValue({ success: true, data: [] }),
  }),
  createGitClient: vi.fn().mockResolvedValue({
    repositoryIds: vi.fn().mockReturnValue([]),
    checkoutAll: vi.fn().mockResolvedValue(new Map()),
    checkout: vi.fn(),
    release: vi.fn(),
    releaseAll: vi.fn().mockResolvedValue(undefined),
    logStats: vi.fn(),
    destroy: vi.fn(),
  }),
  createLlmClient: vi.fn().mockReturnValue({
    prompt: vi.fn().mockResolvedValue({ success: true, data: "mock" }),
  }),
  createStaticAnalysisClient: vi.fn().mockReturnValue({
    analyze: vi.fn(),
  }),
  createTimeTrackingClient: vi.fn().mockResolvedValue({
    getTimeSheet: vi.fn().mockResolvedValue({ success: true, data: [] }),
  }),
}));

vi.mock("@isv/services", () => ({
  createStatusQuoMiner: vi.fn().mockReturnValue({
    mine: vi.fn().mockResolvedValue({ success: true, data: [] }),
  }),
  createArchitectureScanner: vi.fn().mockReturnValue({
    scan: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
  createGapAnalyzer: vi.fn().mockReturnValue({
    analyze: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
  createValuationService: vi.fn().mockReturnValue({
    calculate: vi.fn(),
    deriveC2: vi.fn(),
    aggregateC2: vi.fn(),
  }),
  createCalibrationService: vi.fn().mockReturnValue({
    calibrate: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Valid config fixture
// ---------------------------------------------------------------------------

const validConfig: Record<string, unknown> = {
  project: { name: "Test Project", ticketPrefix: "TEST", slug: "test" },
  jira: {
    dataFolderName: "test",
    ticketPrefix: "TEST",
    rawFormat: "jira-xml",
  },
  git: {
    repositories: [
      { repositoryId: "repo-1", localPath: "/tmp/test-repo" },
    ],
    dataFolderName: "test",
  },
  llm: {
    provider: "github-copilot-cli",
  },
  timeTracking: {
    rawFormat: "teamleader-excel",
    dataFolderName: "test",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createHistoricalCalibrationFromConfig — boundary test", () => {
  it("produces a runnable pipeline from valid config", async () => {
    const result = await createHistoricalCalibrationFromConfig(validConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.pipeline).toBeDefined();
    expect(typeof result.data.pipeline.run).toBe("function");
    expect(typeof result.data.cleanup).toBe("function");
  });

  // AC-A4.1: config-factory passes CacheConfig to createArchitectureScanner
  it("passes CacheConfig with enabled:true to createArchitectureScanner", async () => {
    const result = await createHistoricalCalibrationFromConfig(validConfig);
    expect(result.success).toBe(true);

    expect(createArchitectureScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        cacheDir: expect.stringContaining("cache"),
      }),
    );
  });

  it("computes cacheDir using cwd when provided", async () => {
    const cwd = "/repo-root";
    const result = await createHistoricalCalibrationFromConfig(validConfig, {
      cwd,
    });
    expect(result.success).toBe(true);

    expect(createArchitectureScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        cacheDir: expect.stringContaining("/repo-root/data/test/cache"),
      }),
    );
  });

  it("passes CacheConfig with enabled:true to createStatusQuoMiner", async () => {
    const result = await createHistoricalCalibrationFromConfig(validConfig);
    expect(result.success).toBe(true);

    expect(createStatusQuoMiner).toHaveBeenCalledWith(
      expect.anything(), // staticAnalysis
      expect.anything(), // gitClient
      expect.objectContaining({
        enabled: true,
        cacheDir: expect.stringContaining("cache"),
      }),
    );
  });

  it("returns INVALID_PROJECT_CONFIG when required sections are missing", async () => {
    const config = {
      ...validConfig,
      jira: undefined,
      git: undefined,
      llm: undefined,
      timeTracking: undefined,
    };
    const result = await createHistoricalCalibrationFromConfig(
      config as Record<string, unknown>,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_PROJECT_CONFIG");
    expect(result.error.message).toContain("jira");
    expect(result.error.message).toContain("git");
    expect(result.error.message).toContain("llm");
    expect(result.error.message).toContain("timeTracking");
  });
});
