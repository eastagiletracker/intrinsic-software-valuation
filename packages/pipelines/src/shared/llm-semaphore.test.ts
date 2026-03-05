import { describe, it, expect } from "vitest";

import { createLlmGate } from "./llm-semaphore.js";

describe("createLlmGate", () => {
  it("limits concurrent executions to the configured concurrency", async () => {
    const gate = createLlmGate(2);
    let running = 0;
    let maxRunning = 0;

    const task = () =>
      gate(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 50));
        running--;
        return running;
      });

    // Launch 5 tasks concurrently
    await Promise.all([task(), task(), task(), task(), task()]);

    expect(maxRunning).toBe(2);
  });

  it("defaults to concurrency 2", async () => {
    const gate = createLlmGate();
    let running = 0;
    let maxRunning = 0;

    const task = () =>
      gate(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 30));
        running--;
      });

    await Promise.all([task(), task(), task(), task()]);

    expect(maxRunning).toBe(2);
  });

  it("allows higher concurrency when configured", async () => {
    const gate = createLlmGate(4);
    let running = 0;
    let maxRunning = 0;

    const task = () =>
      gate(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 30));
        running--;
      });

    await Promise.all([task(), task(), task(), task(), task()]);

    expect(maxRunning).toBe(4);
  });

  it("propagates return values", async () => {
    const gate = createLlmGate(1);
    const result = await gate(async () => "hello");
    expect(result).toBe("hello");
  });

  it("propagates errors", async () => {
    const gate = createLlmGate(1);
    await expect(
      gate(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
