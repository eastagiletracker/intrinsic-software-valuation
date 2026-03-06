import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LlmPromptInput } from "../port.js";
import { GithubCopilotCliAdapter } from "./adapter.js";

// ---------------------------------------------------------------------------
// Mock child_process.spawn
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const { spawn } = await import("node:child_process");
const mockSpawn = vi.mocked(spawn);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a fake ChildProcess-like object.
 *
 * Uses plain EventEmitters for stdout/stderr so that pushing data
 * fires "data" events synchronously — unlike real Readables.
 */
function fakeChild() {
  const emitter = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  emitter.stdout = new EventEmitter();
  emitter.stderr = new EventEmitter();
  emitter.kill = vi.fn();
  return emitter;
}

/** Emit a stdout data chunk (synchronous). */
function pushStdout(child: ReturnType<typeof fakeChild>, data: string) {
  child.stdout.emit("data", Buffer.from(data));
}

/** Emit a stderr data chunk (synchronous). */
function pushStderr(child: ReturnType<typeof fakeChild>, data: string) {
  child.stderr.emit("data", Buffer.from(data));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GithubCopilotCliAdapter", () => {
  // Disable stall timeout in most tests to avoid timer interference.
  const adapter = new GithubCopilotCliAdapter({
    timeoutMs: 5000,
    stallTimeoutMs: 0,
  });

  const input: LlmPromptInput = {
    systemPrompt: "You are a code analyzer.",
    userPrompt: "Analyze this code.",
  };

  afterEach(() => {
    mockSpawn.mockReset();
    vi.restoreAllMocks();
  });

  it("returns clean text from CLI stdout", async () => {
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = adapter.prompt(input);

    pushStdout(child, "  Analysis result  ");
    child.emit("close", 0);

    const result = await p;
    expect(result.text).toBe("Analysis result");
  });

  it("strips ANSI escape codes from output", async () => {
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = adapter.prompt(input);

    pushStdout(child, "\x1B[32mColored output\x1B[0m");
    child.emit("close", 0);

    const result = await p;
    expect(result.text).toBe("Colored output");
  });

  it("returns ENOENT error when CLI is not installed", async () => {
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = adapter.prompt(input);

    const err = new Error("spawn gh ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    child.emit("error", err);

    await expect(p).rejects.toThrow(/GitHub Copilot CLI is not available/);
  });

  it("returns timeout error when hard timeout fires", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = adapter.prompt(input);
    vi.advanceTimersByTime(5000);

    await expect(p).rejects.toThrow(/timed out after 5000ms/);
    expect(child.kill).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("returns stall error when no output arrives within stallTimeoutMs", async () => {
    vi.useFakeTimers();
    const stallAdapter = new GithubCopilotCliAdapter({
      timeoutMs: 10_000,
      stallTimeoutMs: 2000,
    });
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = stallAdapter.prompt(input);
    vi.advanceTimersByTime(2000);

    await expect(p).rejects.toThrow(/stalled.*no output for 2000ms/);
    expect(child.kill).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("resets stall timer on stdout data", async () => {
    vi.useFakeTimers();
    const stallAdapter = new GithubCopilotCliAdapter({
      timeoutMs: 10_000,
      stallTimeoutMs: 2000,
    });
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = stallAdapter.prompt(input);

    // Advance close to stall timeout, then send data to reset it.
    vi.advanceTimersByTime(1900);
    pushStdout(child, "partial");
    vi.advanceTimersByTime(1900);
    pushStdout(child, " result");
    vi.advanceTimersByTime(100);

    // Complete normally.
    child.emit("close", 0);

    const result = await p;
    expect(result.text).toBe("partial result");
    vi.useRealTimers();
  });

  it("returns error with stderr content on non-zero exit", async () => {
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = adapter.prompt(input);

    pushStderr(child, "Permission denied");
    child.emit("close", 1);

    await expect(p).rejects.toThrow(/Permission denied/);
  });

  it("passes cwd from input to spawn", async () => {
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);

    const p = adapter.prompt({ ...input, cwd: "/custom/dir" });

    pushStdout(child, "ok");
    child.emit("close", 0);
    await p;

    expect(mockSpawn).toHaveBeenCalledWith(
      "gh",
      expect.any(Array),
      expect.objectContaining({ cwd: "/custom/dir" }),
    );
  });

  it("is stateless and safe for concurrent use", async () => {
    const child1 = fakeChild();
    const child2 = fakeChild();
    mockSpawn
      .mockReturnValueOnce(child1 as never)
      .mockReturnValueOnce(child2 as never);

    const p1 = adapter.prompt(input);
    const p2 = adapter.prompt({ ...input, userPrompt: "second prompt" });

    for (const c of [child1, child2]) {
      pushStdout(c, "result");
      c.emit("close", 0);
    }

    const results = await Promise.all([p1, p2]);
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe("result");
    expect(results[1].text).toBe("result");
  });
});
