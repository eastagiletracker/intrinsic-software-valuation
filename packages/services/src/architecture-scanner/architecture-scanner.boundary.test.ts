import { describe, it, expect, vi } from "vitest";
import { resolve } from "node:path";
import { SystemContextSchema } from "@isv/domain";
import type { LlmClient } from "@isv/clients";

import { createArchitectureScanner } from "./factory.js";

// derived from: packages/domain/src/system-context/ schemas
const mockLlmResponse = JSON.stringify({
  systemArchetype: "BACKEND_SERVICE",
  archetypeReasoning: "TypeScript monorepo with domain-driven design and no frontend.",
  techStack: {
    languages: ["TypeScript"],
    frameworks: ["vitest", "zod"],
    infrastructure: ["Node.js", "pnpm"],
  },
  adapterCatalog: {
    inbound: [
      { protocol: "CLI", description: "Command-line interface" },
    ],
    outbound: [
      { systemName: "Git", integrationType: "CLI" },
      { systemName: "Jira", integrationType: "XML export" },
    ],
  },
  corePatterns: [
    {
      category: "BACKEND",
      patternName: "Port-Adapter",
      description: "Hexagonal architecture with port interfaces and adapter implementations",
    },
  ],
  domainModels: ["Ticket", "CodeHealthReport", "SystemContext"],
});

function createMockLlm(response: string): LlmClient {
  return {
    prompt: vi.fn().mockResolvedValue({
      success: true,
      data: response,
    }),
  };
}

describe("Architecture Scanner — boundary test", () => {
  it("produces schema-valid SystemContext from mock LLM response", async () => {
    const scanner = createArchitectureScanner();
    const llm = createMockLlm(mockLlmResponse);

    const result = await scanner.scan("/tmp/test-repo", llm);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const parsed = SystemContextSchema.safeParse(result.data);
    expect(parsed.success).toBe(true);
  });

  it("populates the repository field from directory name", async () => {
    const scanner = createArchitectureScanner();
    const llm = createMockLlm(mockLlmResponse);

    const result = await scanner.scan("/tmp/test-repo", llm);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.repository.repositoryId).toBe("test-repo");
  });

  it("handles markdown-fenced JSON from LLM", async () => {
    const scanner = createArchitectureScanner();
    const fencedResponse = "```json\n" + mockLlmResponse + "\n```";
    const llm = createMockLlm(fencedResponse);

    const result = await scanner.scan("/tmp/test-repo", llm);
    expect(result.success).toBe(true);
  });

  it("returns error when LLM prompt fails", async () => {
    const scanner = createArchitectureScanner();
    const llm: LlmClient = {
      prompt: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: "LLM_PROMPT_FAILED",
          message: "Connection timeout",
          source: "llm-client",
        },
      }),
    };

    const result = await scanner.scan("/tmp/test-repo", llm);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("LLM_PROMPT_FAILED");
  });

  it("returns error when LLM returns invalid JSON", async () => {
    const scanner = createArchitectureScanner();
    const llm = createMockLlm("This is not JSON at all");

    const result = await scanner.scan("/tmp/test-repo", llm);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("ARCH_SCANNER_PARSE_FAILED");
  });

  it("returns error when LLM output doesn't match schema", async () => {
    const scanner = createArchitectureScanner();
    const llm = createMockLlm(JSON.stringify({ invalid: "shape" }));

    const result = await scanner.scan("/tmp/test-repo", llm);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("ARCH_SCANNER_VALIDATION_FAILED");
  });

  it("sends a user prompt containing expected sections when scanning a real fixture", async () => {
    const scanner = createArchitectureScanner();
    const promptSpy = vi.fn().mockResolvedValue({
      success: true,
      data: mockLlmResponse,
    });
    const llm: LlmClient = { prompt: promptSpy };

    const fixtureDir = resolve(
      import.meta.dirname,
      "__fixtures__",
      "sample-repo",
    );
    await scanner.scan(fixtureDir, llm);

    const call = promptSpy.mock.calls[0][0] as { userPrompt: string; systemPrompt: string };

    // AC-1: directory tree section
    expect(call.userPrompt).toContain("## Directory Structure");

    // AC-2: targeted file sections
    expect(call.userPrompt).toContain("## Domain Model Candidates");
    expect(call.userPrompt).toContain("## Integration / Adapter Candidates");
    expect(call.userPrompt).toContain("## Architecture Entry Points");

    // AC-3: dependency section
    expect(call.userPrompt).toContain("## Dependencies");

    // AC-4: key config files
    expect(call.userPrompt).toContain("## Key Configuration Files");

    // AC-5: enhanced system prompt guidance
    expect(call.systemPrompt).toContain("domainModels");
    expect(call.systemPrompt).toContain("adapterCatalog");
    expect(call.systemPrompt).toContain("business-domain entities");
  });
});
