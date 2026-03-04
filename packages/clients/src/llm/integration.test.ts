import { afterEach, describe, expect, it, vi } from "vitest";

import { createLlmClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Integration test — full factory → adapter → response path
//
// Uses a mocked adapter to verify the complete flow without requiring
// the actual GitHub Copilot CLI.
// ---------------------------------------------------------------------------

const mockPrompt = vi.fn();

vi.mock("./github-copilot-cli/index.js", () => ({
  GithubCopilotCliAdapter: class {
    prompt = mockPrompt;
  },
}));

describe("LlmClient — integration", () => {
  afterEach(() => {
    mockPrompt.mockReset();
  });

  it("creates a client and receives a successful response", async () => {
    mockPrompt.mockResolvedValue({
      text: '{"archetype":"BACKEND_SERVICE","components":[]}',
    });

    const client = createLlmClient({ provider: "github-copilot-cli" });

    const result = await client.prompt({
      systemPrompt: "You are an architecture scanner. Return JSON.",
      userPrompt: "Analyze the following repository source code...",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toContain("BACKEND_SERVICE");
    }
  });

  it("handles adapter errors gracefully", async () => {
    mockPrompt.mockRejectedValue(
      new Error("GitHub Copilot CLI is not available"),
    );

    const client = createLlmClient({ provider: "github-copilot-cli" });

    const result = await client.prompt({
      systemPrompt: "You are an architecture scanner.",
      userPrompt: "Analyze this code.",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("LLM_PROMPT_FAILED");
      expect(result.error.source).toBe("llm-client");
      expect(result.error.message).toContain("not available");
    }
  });

  it("forwards optional parameters through the full path", async () => {
    mockPrompt.mockResolvedValue({ text: "response" });

    const client = createLlmClient({
      provider: "github-copilot-cli",
      timeoutMs: 60000,
    });

    const result = await client.prompt({
      systemPrompt: "Analyze",
      userPrompt: "Code here",
      temperature: 0.3,
      maxTokens: 1024,
      cwd: "/tmp/test-repo",
    });

    expect(result.success).toBe(true);
    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        maxTokens: 1024,
        cwd: "/tmp/test-repo",
      }),
    );
  });
});
