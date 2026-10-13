import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryAsync } from "./retry.js";

// These tests exercise the default (real `setTimeout`) delay path — the one
// used in production — by advancing fake timers instead of injecting `delay`.

const stallError = Object.assign(new Error("stall"), { code: "STALL" });
const isStall = (err: unknown) =>
  err instanceof Error && (err as Error & { code?: string }).code === "STALL";

/** Attach a no-op rejection handler so pending rejections are not reported. */
function settle<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}

describe("retryAsync — default timer backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits stallBaseDelayMs before retrying a stall error", async () => {
    const fn = vi.fn().mockRejectedValueOnce(stallError).mockResolvedValue("ok");

    const promise = settle(
      retryAsync(fn, {
        baseDelayMs: 1_000,
        stallBaseDelayMs: 10_000,
        isStallError: isStall,
      }),
    );

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(promise).resolves.toBe("ok");
  });

  it("doubles the stall delay on each attempt (10s → 20s → 40s)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(stallError)
      .mockRejectedValueOnce(stallError)
      .mockRejectedValueOnce(stallError)
      .mockResolvedValue("ok");

    const promise = settle(retryAsync(fn, { isStallError: isStall }));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(fn).toHaveBeenCalledTimes(4);
    await expect(promise).resolves.toBe("ok");
  });

  it("keeps baseDelayMs for non-stall errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok");

    const promise = settle(
      retryAsync(fn, {
        baseDelayMs: 1_000,
        stallBaseDelayMs: 10_000,
        isStallError: isStall,
      }),
    );

    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(promise).resolves.toBe("ok");
  });

  it("applies exponential backoff without stall handling", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const promise = settle(retryAsync(fn, { baseDelayMs: 100 }));

    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);
    await expect(promise).resolves.toBe("ok");
  });

  it("throws the original stall error after stallMaxRetries without a trailing wait", async () => {
    const fn = vi.fn().mockRejectedValue(stallError);

    const promise = settle(
      retryAsync(fn, {
        stallMaxRetries: 2,
        stallBaseDelayMs: 1_000,
        isStallError: isStall,
      }),
    );

    // 1s + 2s of backoff covers both retries; no further wait is needed.
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(promise).rejects.toBe(stallError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not wait when shouldRetry rejects the error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));

    const promise = settle(
      retryAsync(fn, { baseDelayMs: 1_000, shouldRetry: () => false }),
    );

    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("retryAsync — injected delay", () => {
  it("passes the stall backoff to the injected delay and skips the final wait", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(stallError);

    await expect(
      retryAsync(fn, {
        stallMaxRetries: 2,
        stallBaseDelayMs: 1_000,
        isStallError: isStall,
        delay: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toBe(stallError);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1_000, 2_000]);
  });

  it("calls onFailedAttempt on each failure", async () => {
    const attempts: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    await retryAsync(fn, {
      delay: async () => {},
      onFailedAttempt: (info) => {
        attempts.push(info.attemptNumber);
      },
    });

    expect(attempts).toEqual([1, 2]);
  });
});
