import { describe, it, expect, vi, beforeEach } from "vitest";

import { retryAsync } from "./retry.js";

describe("retryAsync", () => {
  const noDelay = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    noDelay.mockClear();
  });

  it("returns immediately on first-try success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await retryAsync(fn, { delay: noDelay });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(noDelay).not.toHaveBeenCalled();
  });

  it("retries and succeeds on the second attempt after one failure", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("recovered");

    const result = await retryAsync(fn, { delay: noDelay });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(noDelay).toHaveBeenCalledTimes(1);
  });

  it("throws the original error after maxRetries are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("persistent"));

    await expect(
      retryAsync(fn, { maxRetries: 2, delay: noDelay }),
    ).rejects.toThrow("persistent");

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("applies exponential backoff delays", async () => {
    const delays: number[] = [];
    const trackingDelay = async (ms: number) => {
      delays.push(ms);
    };

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"))
      .mockResolvedValue("ok");

    await retryAsync(fn, {
      maxRetries: 3,
      baseDelayMs: 100,
      backoffFactor: 2,
      delay: trackingDelay,
    });

    // attempt 0 fails → delay 100 * 2^0 = 100
    // attempt 1 fails → delay 100 * 2^1 = 200
    // attempt 2 fails → delay 100 * 2^2 = 400
    expect(delays).toEqual([100, 200, 400]);
  });

  it("respects custom shouldRetry predicate — retries matching errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("TIMEOUT"))
      .mockResolvedValue("ok");

    const result = await retryAsync(fn, {
      delay: noDelay,
      shouldRetry: (err) =>
        err instanceof Error && err.message.includes("TIMEOUT"),
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("PERMANENT"));

    await expect(
      retryAsync(fn, {
        delay: noDelay,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow("PERMANENT");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(noDelay).not.toHaveBeenCalled();
  });

  it("uses default options when none provided (maxRetries=3)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const trackingDelay = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryAsync(fn, { delay: trackingDelay }),
    ).rejects.toThrow("fail");

    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("calls onFailedAttempt on each retry", async () => {
    const attempts: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    await retryAsync(fn, {
      delay: noDelay,
      onFailedAttempt: (error) => {
        attempts.push(error.attemptNumber);
      },
    });

    expect(attempts).toEqual([1, 2]);
  });

  // -----------------------------------------------------------------------
  // Stall-timeout retry behaviour
  // -----------------------------------------------------------------------

  it("uses stallBaseDelayMs for stall errors instead of baseDelayMs", async () => {
    const delays: number[] = [];
    const trackingDelay = async (ms: number) => {
      delays.push(ms);
    };

    const stallError = Object.assign(new Error("stall"), { code: "STALL" });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(stallError)
      .mockResolvedValue("ok");

    await retryAsync(fn, {
      baseDelayMs: 100,
      stallBaseDelayMs: 10_000,
      backoffFactor: 2,
      isStallError: (err) =>
        err instanceof Error && (err as any).code === "STALL",
      delay: trackingDelay,
    });

    expect(delays).toEqual([10_000]); // stallBaseDelayMs, not baseDelayMs
  });

  it("limits stall retries to stallMaxRetries", async () => {
    const stallError = Object.assign(new Error("stall"), { code: "STALL" });
    const fn = vi.fn().mockRejectedValue(stallError);

    await expect(
      retryAsync(fn, {
        maxRetries: 10,
        stallMaxRetries: 2,
        delay: noDelay,
        isStallError: (err) =>
          err instanceof Error && (err as any).code === "STALL",
      }),
    ).rejects.toThrow("stall");

    // 1 initial + 2 stall retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("non-stall errors still use baseDelayMs when isStallError is set", async () => {
    const delays: number[] = [];
    const trackingDelay = async (ms: number) => {
      delays.push(ms);
    };

    const normalError = new Error("transient");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(normalError)
      .mockResolvedValue("ok");

    await retryAsync(fn, {
      baseDelayMs: 100,
      stallBaseDelayMs: 10_000,
      backoffFactor: 2,
      isStallError: () => false,
      delay: trackingDelay,
    });

    expect(delays).toEqual([100]); // baseDelayMs, not stallBaseDelayMs
  });

  it("applies exponential backoff to stall delays", async () => {
    const delays: number[] = [];
    const trackingDelay = async (ms: number) => {
      delays.push(ms);
    };

    const stallError = Object.assign(new Error("stall"), { code: "STALL" });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(stallError)
      .mockRejectedValueOnce(stallError)
      .mockRejectedValueOnce(stallError)
      .mockResolvedValue("ok");

    await retryAsync(fn, {
      stallMaxRetries: 4,
      stallBaseDelayMs: 1_000,
      backoffFactor: 2,
      isStallError: (err) =>
        err instanceof Error && (err as any).code === "STALL",
      delay: trackingDelay,
    });

    // attempt 0 fails → 1000 * 2^0 = 1000
    // attempt 1 fails → 1000 * 2^1 = 2000
    // attempt 2 fails → 1000 * 2^2 = 4000
    expect(delays).toEqual([1_000, 2_000, 4_000]);
  });
});
