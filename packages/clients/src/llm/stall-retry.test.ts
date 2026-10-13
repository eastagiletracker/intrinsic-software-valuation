import { describe, expect, it, vi } from "vitest";
import type { Result } from "@isv/domain";

import { retryOnLlmStall } from "./stall-retry.js";

// derived from: packages/clients/src/llm/factory.ts (DefaultLlmClient error mapping)
const stallResult: Result<string> = {
  success: false,
  error: {
    code: "LLM_STALL",
    message: "LLM request stalled (no output for 30000ms).",
    source: "llm-client",
  },
};

const failedResult: Result<string> = {
  success: false,
  error: {
    code: "LLM_PROMPT_FAILED",
    message: "GitHub Copilot CLI failed: exit code 1",
    source: "llm-client",
  },
};

const okResult: Result<string> = { success: true, data: "LLM response" };

describe("retryOnLlmStall", () => {
  const noDelay = vi.fn().mockResolvedValue(undefined);

  it("returns a successful result without retrying", async () => {
    const fn = vi.fn().mockResolvedValue(okResult);

    const result = await retryOnLlmStall(fn, { delay: noDelay });

    expect(result).toEqual(okResult);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a stall result and returns the later success", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(stallResult)
      .mockResolvedValueOnce(stallResult)
      .mockResolvedValue(okResult);

    const result = await retryOnLlmStall(fn, { delay: noDelay });

    expect(result).toEqual(okResult);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("waits with the stall backoff between attempts", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockResolvedValueOnce(stallResult)
      .mockResolvedValueOnce(stallResult)
      .mockResolvedValue(okResult);

    await retryOnLlmStall(fn, {
      baseDelayMs: 2_000,
      stallBaseDelayMs: 5_000,
      backoffFactor: 2,
      delay: async (ms) => {
        delays.push(ms);
      },
    });

    expect(delays).toEqual([5_000, 10_000]);
  });

  it("returns the last stall result once stall retries are exhausted", async () => {
    const fn = vi.fn().mockResolvedValue(stallResult);

    const result = await retryOnLlmStall(fn, {
      stallMaxRetries: 3,
      delay: noDelay,
    });

    expect(result).toEqual(stallResult);
    // 1 initial + 3 stall retries
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does not retry non-stall failures", async () => {
    const fn = vi.fn().mockResolvedValue(failedResult);

    const result = await retryOnLlmStall(fn, { delay: noDelay });

    expect(result).toEqual(failedResult);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns a non-stall failure that follows a stall", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(stallResult)
      .mockResolvedValue(failedResult);

    const result = await retryOnLlmStall(fn, { delay: noDelay });

    expect(result).toEqual(failedResult);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows errors thrown by the call itself", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(stallResult)
      .mockRejectedValue(new Error("boom"));

    await expect(retryOnLlmStall(fn, { delay: noDelay })).rejects.toThrow(
      "boom",
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
