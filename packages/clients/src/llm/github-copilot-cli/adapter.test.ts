import { afterEach, describe, expect, it, vi } from "vitest";

import type { LlmPromptInput } from "../port.js";
import { GithubCopilotCliAdapter } from "./adapter.js";

// ---------------------------------------------------------------------------
// Mock child_process.execFile
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Import *after* mocking so we get the mocked version
const { execFile } = await import("node:child_process");
const mockExecFile = vi.mocked(execFile);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GithubCopilotCliAdapter", () => {
  const adapter = new GithubCopilotCliAdapter({ timeoutMs: 5000 });

  const input: LlmPromptInput = {
    systemPrompt: "You are a code analyzer.",
    userPrompt: "Analyze this code.",
  };

  afterEach(() => {
    mockExecFile.mockReset();
  });

  it("returns clean text from CLI stdout", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as (err: null, stdout: string, stderr: string) => void)(
          null,
          "  Analysis result  ",
          "",
        );
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await adapter.prompt(input);
    expect(result.text).toBe("Analysis result");
  });

  it("strips ANSI escape codes from output", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as (err: null, stdout: string, stderr: string) => void)(
          null,
          "\x1B[32mColored output\x1B[0m",
          "",
        );
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await adapter.prompt(input);
    expect(result.text).toBe("Colored output");
  });

  it("returns ENOENT error when CLI is not installed", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = new Error("spawn gh ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        (cb as (err: Error) => void)(err);
        return {} as ReturnType<typeof execFile>;
      },
    );

    await expect(adapter.prompt(input)).rejects.toThrow(
      /GitHub Copilot CLI is not available/,
    );
  });

  it("returns timeout error when CLI times out", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = new Error("process timed out") as Error & {
          killed: boolean;
        };
        err.killed = true;
        (cb as (err: Error) => void)(err);
        return {} as ReturnType<typeof execFile>;
      },
    );

    await expect(adapter.prompt(input)).rejects.toThrow(
      /timed out after 5000ms/,
    );
  });

  it("returns error with stderr content on non-zero exit", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = new Error("Command failed");
        (cb as (err: Error, stdout: string, stderr: string) => void)(
          err,
          "",
          "Permission denied",
        );
        return {} as ReturnType<typeof execFile>;
      },
    );

    await expect(adapter.prompt(input)).rejects.toThrow(/Permission denied/);
  });

  it("passes cwd from input to execFile", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, opts: unknown, cb: unknown) => {
        (cb as (err: null, stdout: string, stderr: string) => void)(
          null,
          "ok",
          "",
        );
        return {} as ReturnType<typeof execFile>;
      },
    );

    await adapter.prompt({ ...input, cwd: "/custom/dir" });

    expect(mockExecFile).toHaveBeenCalledWith(
      "gh",
      expect.any(Array),
      expect.objectContaining({ cwd: "/custom/dir" }),
      expect.any(Function),
    );
  });

  it("is stateless and safe for concurrent use", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as (err: null, stdout: string, stderr: string) => void)(
          null,
          "result",
          "",
        );
        return {} as ReturnType<typeof execFile>;
      },
    );

    const results = await Promise.all([
      adapter.prompt(input),
      adapter.prompt({ ...input, userPrompt: "second prompt" }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].text).toBe("result");
    expect(results[1].text).toBe("result");
  });
});
