import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  GapAnalysisResultSchema,
  type SystemBaseline,
  type Ticket,
  type ProjectConfig,
} from "@isv/domain";
import type { LlmClient } from "@isv/clients";

import { createGapAnalyzer } from "./factory.js";

const fixtureResponse = readFileSync(
  resolve(import.meta.dirname, "__fixtures__", "gap-analysis-response.json"),
  "utf-8",
);

// derived from: packages/domain/src/ baseline/system-baseline.schema.ts
const mockBaseline: SystemBaseline = {
  timestamp: "2025-01-01T00:00:00.000Z",
  repositories: [
    {
      systemContext: {
        repository: { repositoryId: "test-repo" },
        systemArchetype: "BACKEND_SERVICE",
        archetypeReasoning: "TypeScript backend service.",
        techStack: {
          languages: ["TypeScript"],
          frameworks: ["vitest"],
          infrastructure: ["Node.js"],
        },
        adapterCatalog: {
          inbound: [{ protocol: "CLI", description: "CLI interface" }],
          outbound: [],
        },
        corePatterns: [
          {
            category: "BACKEND",
            patternName: "Port-Adapter",
            description: "Hexagonal architecture",
          },
        ],
        domainModels: ["Ticket"],
      },
      codeHealthReport: {
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
            outdatedDependencies: 2,
            deadCodeFiles: 1,
          },
        },
      },
    },
  ],
};

// derived from: packages/domain/src/ticket/ticket.schema.ts
const mockTicket: Ticket = {
  ticketId: "PROJ-42",
  projectKey: "PROJ",
  type: "Story",
  status: "Ready for Refinement",
  title: "Add input validation to processing pipeline",
  description:
    "As a developer, I want input validation so that invalid data is rejected early.",
  labels: ["backend"],
  comments: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

const mockConfig: ProjectConfig = {
  d3QualityFloor: 1,
};

function createMockLlm(response: string): LlmClient {
  return {
    prompt: vi.fn().mockResolvedValue({
      success: true,
      data: response,
    }),
  };
}

describe("Gap Analyzer — boundary test", () => {
  it("produces schema-valid GapAnalysisResult from mock LLM", async () => {
    const analyzer = createGapAnalyzer();
    const llm = createMockLlm(fixtureResponse);

    const result = await analyzer.analyze(
      mockBaseline,
      mockTicket,
      mockConfig,
      llm,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const parsed = GapAnalysisResultSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
  });

  it("returns all five ISV factor scores", async () => {
    const analyzer = createGapAnalyzer();
    const llm = createMockLlm(fixtureResponse);

    const result = await analyzer.analyze(
      mockBaseline,
      mockTicket,
      mockConfig,
      llm,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const scoring = result.data.isvScoring;
    expect(scoring.A1_Data.score).toBe(1);
    expect(scoring.A2_UX.score).toBe(2);
    expect(scoring.B1_Logic.score).toBe(2);
    expect(scoring.C1_Integration.score).toBe(1);
    expect(scoring.D3_Quality.score).toBe(1);
  });

  it("enforces D3 quality floor from ProjectConfig", async () => {
    const analyzer = createGapAnalyzer();
    const llm = createMockLlm(fixtureResponse);
    const configWithFloor: ProjectConfig = { d3QualityFloor: 2 };

    const result = await analyzer.analyze(
      mockBaseline,
      mockTicket,
      configWithFloor,
      llm,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    // D3 from fixture is 1, floor is 2 → should be raised to 2
    expect(result.data.isvScoring.D3_Quality.score).toBe(2);
  });

  it("returns error when LLM prompt fails", async () => {
    const analyzer = createGapAnalyzer();
    const llm: LlmClient = {
      prompt: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: "LLM_PROMPT_FAILED",
          message: "Timeout",
          source: "llm-client",
        },
      }),
    };

    const result = await analyzer.analyze(
      mockBaseline,
      mockTicket,
      mockConfig,
      llm,
    );
    expect(result.success).toBe(false);
  });

  it("returns error when LLM returns invalid JSON", async () => {
    const analyzer = createGapAnalyzer();
    const llm = createMockLlm("not json");

    const result = await analyzer.analyze(
      mockBaseline,
      mockTicket,
      mockConfig,
      llm,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("GAP_ANALYZER_PARSE_FAILED");
  });

  it("returns error when LLM output doesn't match schema", async () => {
    const analyzer = createGapAnalyzer();
    const llm = createMockLlm(JSON.stringify({ invalid: true }));

    const result = await analyzer.analyze(
      mockBaseline,
      mockTicket,
      mockConfig,
      llm,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("GAP_ANALYZER_VALIDATION_FAILED");
  });
});
