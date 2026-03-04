import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { createLlmClient } from "./factory.js";

// ---------------------------------------------------------------------------
// Real-world tests — invoke the actual GitHub Copilot CLI
//
// These tests are skipped automatically when the CLI is not available
// (e.g. in CI). Run locally with:  pnpm test:realworld
//
// File naming: *.realworld.test.ts — excluded from default `pnpm test` via
// vitest config and runnable via dedicated `pnpm test:realworld` script.
// ---------------------------------------------------------------------------

function isCopilotCliAvailable(): boolean {
  try {
    execSync("gh copilot --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const CLI_AVAILABLE = isCopilotCliAvailable();

describe.skipIf(!CLI_AVAILABLE)("LlmClient — realworld (copilot-cli)", () => {
  it("sends a minimal prompt and receives a response", async () => {
    const client = createLlmClient({ provider: "github-copilot-cli" });

    const result = await client.prompt({
      systemPrompt: "You are a helpful assistant.",
      userPrompt: "Say hello in one word.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
    }
  });
});
