import { describe, it, expect } from "vitest";

import { AsyncMutex } from "./async-mutex.js";

describe("AsyncMutex", () => {
  it("serializes concurrent async operations", async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];

    const task = (id: number, ms: number) =>
      mutex.run(async () => {
        order.push(id);
        await new Promise((r) => setTimeout(r, ms));
        order.push(id * 10);
      });

    // Fire 3 tasks concurrently — they must execute in arrival order.
    await Promise.all([task(1, 10), task(2, 5), task(3, 1)]);

    // Each task pushed its id then id*10 without interleaving.
    expect(order).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("returns the value from the executed function", async () => {
    const mutex = new AsyncMutex();
    const result = await mutex.run(async () => 42);
    expect(result).toBe(42);
  });

  it("propagates rejections without breaking the chain", async () => {
    const mutex = new AsyncMutex();

    await expect(
      mutex.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // A subsequent call should still work.
    const result = await mutex.run(async () => "ok");
    expect(result).toBe("ok");
  });
});
