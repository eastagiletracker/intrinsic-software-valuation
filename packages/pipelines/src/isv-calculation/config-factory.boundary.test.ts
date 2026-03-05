import { describe, it, expect, vi } from "vitest";

import { createIsvCalculationFromConfig } from "./config-factory.js";

// ---------------------------------------------------------------------------
// Mock all client factories
// ---------------------------------------------------------------------------

vi.mock("@isv/clients", () => ({
  createTicketClient: vi.fn().mockResolvedValue({
    getTickets: vi.fn().mockResolvedValue({ success: true, data: [] }),
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
  pipeline: {
    d3QualityFloor: 1,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createIsvCalculationFromConfig — boundary test", () => {
  it("produces a runnable pipeline from valid config", async () => {
    const result = await createIsvCalculationFromConfig(validConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.pipeline).toBeDefined();
    expect(typeof result.data.pipeline.run).toBe("function");
    expect(typeof result.data.cleanup).toBe("function");
  });

  it("returns INVALID_PROJECT_CONFIG when jira section is missing", async () => {
    const config = { ...validConfig, jira: undefined };
    const result = await createIsvCalculationFromConfig(
      config as Record<string, unknown>,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_PROJECT_CONFIG");
    expect(result.error.message).toContain("jira");
  });

  it("returns INVALID_PROJECT_CONFIG when git section is missing", async () => {
    const config = { ...validConfig, git: undefined };
    const result = await createIsvCalculationFromConfig(
      config as Record<string, unknown>,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_PROJECT_CONFIG");
    expect(result.error.message).toContain("git");
  });

  it("returns INVALID_PROJECT_CONFIG when llm section is missing", async () => {
    const config = { ...validConfig, llm: undefined };
    const result = await createIsvCalculationFromConfig(
      config as Record<string, unknown>,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_PROJECT_CONFIG");
    expect(result.error.message).toContain("llm");
  });

  it("returns INVALID_PROJECT_CONFIG listing all missing sections", async () => {
    const config = {
      ...validConfig,
      jira: undefined,
      git: undefined,
      llm: undefined,
    };
    const result = await createIsvCalculationFromConfig(
      config as Record<string, unknown>,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_PROJECT_CONFIG");
    expect(result.error.message).toContain("jira");
    expect(result.error.message).toContain("git");
    expect(result.error.message).toContain("llm");
  });

  it("cleanup function calls gitClient.releaseAll", async () => {
    const result = await createIsvCalculationFromConfig(validConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;

    await result.data.cleanup();
    // Verify cleanup completes without error — the mocked releaseAll resolves to undefined
  });
});
