import { describe, it, expect, vi } from "vitest";
import type {
  GapAnalysisResult,
  SystemBaseline,
  Ticket,
  ProjectConfig,
  Result,
} from "@isv/domain";
import type { LlmClient } from "@isv/clients";
import { FileCache } from "@isv/clients";
import type { CacheConfig } from "@isv/clients";

import { CachedGapAnalyzerService } from "./cached-gap-analyzer.js";
import type { GapAnalyzerPort } from "./port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGapResult(ticketId = "PROJ-42"): GapAnalysisResult {
  return {
    ticketId,
    meta: { isTicketActionable: true, confidenceScore: 0.85 },
    architecturalFit: {
      canBeImplementedWithExistingPatterns: true,
      summary: "Fits existing patterns.",
    },
    identifiedGaps: {
      data: { hasGap: false, missingEntities: [], description: "No data gaps." },
      ui: { hasGap: false, description: "No UI gaps." },
      logic: { hasGap: false, description: "No logic gaps." },
      integration: { hasGap: false, missingAdapters: [], description: "No integration gaps." },
    },
    requiredModifications: { architectureExtensions: [], actionItems: [] },
    isvScoring: {
      A1_Data: { score: 2, reasoning: "Single entity CRUD" },
      A2_UX: { score: 2, reasoning: "Standard component" },
      B1_Logic: { score: 3, reasoning: "Workflow" },
      C1_Integration: { score: 1, reasoning: "Local" },
      D3_Quality: { score: 1, reasoning: "Standard DoD" },
    },
  };
}

function makeSuccessResult(ticketId = "PROJ-42"): Result<GapAnalysisResult> {
  return { success: true, data: makeGapResult(ticketId) };
}

function makeFailureResult(): Result<GapAnalysisResult> {
  return {
    success: false,
    error: {
      code: "GAP_ANALYZER_FAILED",
      message: "LLM timeout",
      source: "gap-analyzer",
    },
  };
}

function makeBaseline(): SystemBaseline {
  return {
    timestamp: "2025-09-01T00:00:00Z",
    repositories: [
      {
        systemContext: {
          repository: { repositoryId: "frontend" },
          systemArchetype: "HEADLESS_FRONTEND",
          archetypeReasoning: "SPA",
          techStack: { languages: ["TypeScript"], frameworks: ["React"], infrastructure: [] },
          adapterCatalog: {
            inbound: [{ protocol: "HTTP", description: "REST API" }],
            outbound: [{ systemName: "backend-api", integrationType: "REST" }],
          },
          corePatterns: [{ category: "FRONTEND", patternName: "Component", description: "React components" }],
          domainModels: ["User", "Project"],
        },
        codeHealthReport: {
          repository: { repositoryId: "frontend" },
          timestamp: "2025-09-01T00:00:00Z",
          structuralFacts: {
            volume: { totalLinesOfCode: 5000, totalFiles: 50 },
            entryPoints: { controllers: 3, views: 10 },
            gitHotspots: [],
          },
          healthScores: {
            complexity: { avgCyclomaticComplexity: 5, duplicationPercentage: 3, godClassCount: 0 },
            testHealth: { coveragePercentage: 60, outdatedDependencies: 2, deadCodeFiles: 0 },
          },
        },
        c2State: 1,
      },
    ],
    effectiveC2: 1,
  };
}

function makeTicket(id = "PROJ-42"): Ticket {
  return {
    ticketId: id,
    projectKey: "PROJ",
    type: "Story",
    title: "Add user profile page",
    description: "Create a new user profile page with avatar upload.",
    status: "To Do",
    labels: [],
    comments: [],
    createdAt: "2025-08-01T00:00:00Z",
    updatedAt: "2025-08-15T00:00:00Z",
  };
}

function makeConfig(): ProjectConfig {
  return { d3QualityFloor: 1, legacyDailyRate: 1000, minCohortSampleSize: 18, excludeTypes: ["Epic"] };
}

function mockInner(result: Result<GapAnalysisResult> = makeSuccessResult()): GapAnalyzerPort {
  return {
    analyze: vi.fn<GapAnalyzerPort["analyze"]>().mockResolvedValue(result),
  };
}

function mockLlm(): LlmClient {
  return {
    prompt: vi.fn().mockResolvedValue({ success: true, data: "mock" }),
  };
}

function enabledConfig(): CacheConfig {
  return { enabled: true, cacheDir: "/tmp/test-gap-cache" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CachedGapAnalyzerService", () => {
  it("returns cached result on second call with same inputs; calls inner only once", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    let callCount = 0;
    vi.spyOn(cache, "getOrCompute").mockImplementation(async (_key, compute) => {
      callCount++;
      if (callCount === 1) return compute();
      return makeGapResult();
    });

    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();
    const baseline = makeBaseline();
    const ticket = makeTicket();
    const projConfig = makeConfig();

    const result1 = await cached.analyze(baseline, ticket, projConfig, llm);
    const result2 = await cached.analyze(baseline, ticket, projConfig, llm);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(inner.analyze).toHaveBeenCalledOnce();
    expect(cache.getOrCompute).toHaveBeenCalledTimes(2);
  });

  it("produces different cache keys for different tickets", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();
    const baseline = makeBaseline();
    const projConfig = makeConfig();

    await cached.analyze(baseline, makeTicket("PROJ-42"), projConfig, llm);
    await cached.analyze(baseline, makeTicket("PROJ-99"), projConfig, llm);

    expect(computeSpy).toHaveBeenCalledTimes(2);
    const key1 = computeSpy.mock.calls[0][0];
    const key2 = computeSpy.mock.calls[1][0];
    expect(key1).not.toBe(key2);
  });

  it("produces different cache keys for different d3QualityFloor", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();
    const baseline = makeBaseline();
    const ticket = makeTicket();

    await cached.analyze(baseline, ticket, { d3QualityFloor: 1, legacyDailyRate: 1000, minCohortSampleSize: 18, excludeTypes: ["Epic"] }, llm);
    await cached.analyze(baseline, ticket, { d3QualityFloor: 2, legacyDailyRate: 1000, minCohortSampleSize: 18, excludeTypes: ["Epic"] }, llm);

    const key1 = computeSpy.mock.calls[0][0];
    const key2 = computeSpy.mock.calls[1][0];
    expect(key1).not.toBe(key2);
  });

  it("produces different cache keys for different baselines", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();
    const ticket = makeTicket();
    const projConfig = makeConfig();

    const baseline1 = makeBaseline();
    const baseline2 = makeBaseline();
    baseline2.repositories[0].systemContext.systemArchetype = "BACKEND_SERVICE";

    await cached.analyze(baseline1, ticket, projConfig, llm);
    await cached.analyze(baseline2, ticket, projConfig, llm);

    const key1 = computeSpy.mock.calls[0][0];
    const key2 = computeSpy.mock.calls[1][0];
    expect(key1).not.toBe(key2);
  });

  it("propagates errors from inner analyzer without caching them", async () => {
    const inner = mockInner(makeFailureResult());
    const config = enabledConfig();
    const cache = new FileCache(config);
    vi.spyOn(cache, "getOrCompute").mockImplementation(async (_key, compute) => {
      return compute();
    });

    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();

    const result = await cached.analyze(makeBaseline(), makeTicket(), makeConfig(), llm);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("GAP_ANALYZER_FAILED");
    }
  });

  it("uses cache key with gap-analyzer/analyze prefix", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();

    await cached.analyze(makeBaseline(), makeTicket(), makeConfig(), llm);

    const key = computeSpy.mock.calls[0][0];
    expect(key).toMatch(/^gap-analyzer\/analyze\//);
  });

  it("delegates to inner when cache is disabled", async () => {
    const inner = mockInner();
    const cache = new FileCache({ enabled: false, cacheDir: "/tmp/unused" });
    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();

    const result = await cached.analyze(makeBaseline(), makeTicket(), makeConfig(), llm);

    expect(result.success).toBe(true);
    expect(inner.analyze).toHaveBeenCalledOnce();
  });

  it("produces same cache key for same inputs regardless of baseline timestamp", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedGapAnalyzerService(inner, cache);
    const llm = mockLlm();
    const ticket = makeTicket();
    const projConfig = makeConfig();

    const baseline1 = makeBaseline();
    baseline1.timestamp = "2025-09-01T00:00:00Z";
    const baseline2 = makeBaseline();
    baseline2.timestamp = "2025-10-15T12:00:00Z";

    await cached.analyze(baseline1, ticket, projConfig, llm);
    await cached.analyze(baseline2, ticket, projConfig, llm);

    const key1 = computeSpy.mock.calls[0][0];
    const key2 = computeSpy.mock.calls[1][0];
    expect(key1).toBe(key2);
  });
});
