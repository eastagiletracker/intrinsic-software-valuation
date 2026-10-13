import { afterEach, describe, expect, it, vi } from "vitest";

import type { LlmClient } from "./client.js";
import { createLlmClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Mock the GithubCopilotCliAdapter
// ---------------------------------------------------------------------------

const mockPrompt = vi.fn();

vi.mock("./github-copilot-cli/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./github-copilot-cli/index.js")>()),
  GithubCopilotCliAdapter: class {
    prompt = mockPrompt;
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createLlmClient", () => {
  afterEach(() => {
    mockPrompt.mockReset();
  });

  // ---- Factory resolution ----

  it("throws for an unknown provider", () => {
    expect(() =>
      createLlmClient({
        provider: "unknown" as "github-copilot-cli",
      }),
    ).toThrow(/unknown llm provider/i);
  });

  it("returns a client instance for github-copilot-cli", () => {
    const client = createLlmClient({
      provider: "github-copilot-cli",
    });
    expect(client).toBeDefined();
    expect(typeof client.prompt).toBe("function");
  });

  // ---- Successful prompt ----

  it("returns success result when adapter resolves", async () => {
    mockPrompt.mockResolvedValue({ text: "LLM response" });

    const client = createLlmClient({ provider: "github-copilot-cli" });
    const result = await client.prompt({
      systemPrompt: "Analyze code",
      userPrompt: "Here is the code.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("LLM response");
    }
  });

  // ---- Error handling ----

  it("returns error result when adapter rejects", async () => {
    mockPrompt.mockRejectedValue(new Error("CLI not found"));

    const client = createLlmClient({ provider: "github-copilot-cli" });
    const result = await client.prompt({
      systemPrompt: "Analyze code",
      userPrompt: "Here is the code.",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("LLM_PROMPT_FAILED");
      expect(result.error.source).toBe("llm-client");
      expect(result.error.message).toContain("CLI not found");
    }
  });

  it("keeps the LLM_STALL code when the adapter rejects with a stall", async () => {
    mockPrompt.mockRejectedValue(
      Object.assign(new Error("LLM request stalled (no output for 30000ms)."), {
        code: "LLM_STALL",
      }),
    );

    const client = createLlmClient({ provider: "github-copilot-cli" });
    const result = await client.prompt({
      systemPrompt: "Analyze code",
      userPrompt: "Here is the code.",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("LLM_STALL");
      expect(result.error.source).toBe("llm-client");
      expect(result.error.message).toContain("stalled");
    }
  });

  it("passes query fields to the adapter", async () => {
    mockPrompt.mockResolvedValue({ text: "ok" });

    const client = createLlmClient({ provider: "github-copilot-cli" });
    await client.prompt({
      systemPrompt: "System instruction",
      userPrompt: "User content",
      temperature: 0.5,
      maxTokens: 2048,
      cwd: "/tmp/repo",
    });

    expect(mockPrompt).toHaveBeenCalledWith({
      systemPrompt: "System instruction",
      userPrompt: "User content",
      temperature: 0.5,
      maxTokens: 2048,
      cwd: "/tmp/repo",
    });
  });
});
