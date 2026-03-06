import { describe, it, expect, vi } from "vitest";
import type { SystemContext, Result } from "@isv/domain";
import type { LlmClient } from "@isv/clients";
import { FileCache } from "@isv/clients";
import type { CacheConfig } from "@isv/clients";

import { CachedArchitectureScannerService } from "./cached-scanner.js";
import type { ArchitectureScannerPort } from "./port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSystemContext(repoId = "test-repo"): SystemContext {
  return {
    repository: { repositoryId: repoId },
    systemArchetype: "BACKEND_SERVICE",
    archetypeReasoning: "Test reasoning",
    techStack: { languages: ["TypeScript"], frameworks: [], infrastructure: [] },
    adapterCatalog: { inbound: [], outbound: [] },
    corePatterns: [],
    domainModels: [],
  };
}

function makeSuccessResult(repoId = "test-repo"): Result<SystemContext> {
  return { success: true, data: makeSystemContext(repoId) };
}

function makeFailureResult(): Result<SystemContext> {
  return {
    success: false,
    error: {
      code: "ARCH_SCANNER_FAILED",
      message: "LLM timeout",
      source: "architecture-scanner",
    },
  };
}

function mockInner(result: Result<SystemContext> = makeSuccessResult()): ArchitectureScannerPort {
  return {
    scan: vi.fn<ArchitectureScannerPort["scan"]>().mockResolvedValue(result),
  };
}

function mockLlm(): LlmClient {
  return {
    prompt: vi.fn().mockResolvedValue({ success: true, data: "mock" }),
  };
}

function disabledCache(): FileCache {
  return new FileCache({ enabled: false, cacheDir: "/tmp/unused" });
}

function enabledConfig(): CacheConfig {
  return { enabled: true, cacheDir: "/tmp/test-arch-cache" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CachedArchitectureScannerService", () => {
  // AC-SC-10: Returns cached result on second call with same commitSha
  it("returns cached result on second call with same commitSha; calls inner scanner only once", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    // Simulate getOrCompute: first call → compute, second → cached
    let callCount = 0;
    vi.spyOn(cache, "getOrCompute").mockImplementation(async (_key, compute) => {
      callCount++;
      if (callCount === 1) {
        // First call: run the compute function
        return compute();
      }
      // Second call: return cached data without running compute
      return makeSystemContext();
    });

    const cached = new CachedArchitectureScannerService(inner, cache);
    const llm = mockLlm();

    const result1 = await cached.scan("/tmp/work/test-repo", llm, "abc123");
    const result2 = await cached.scan("/tmp/work/test-repo", llm, "abc123");

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    // Inner scanner should only be called once (during the first getOrCompute)
    expect(inner.scan).toHaveBeenCalledOnce();
    // Cache should be consulted both times
    expect(cache.getOrCompute).toHaveBeenCalledTimes(2);
  });

  // AC-SC-11: Different commitSha values produce separate cache entries
  it("produces different cache keys for different commitSha values", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedArchitectureScannerService(inner, cache);
    const llm = mockLlm();

    await cached.scan("/tmp/work/test-repo", llm, "sha-aaa");
    await cached.scan("/tmp/work/test-repo", llm, "sha-bbb");

    expect(computeSpy).toHaveBeenCalledTimes(2);
    // The cache keys should differ
    const key1 = computeSpy.mock.calls[0][0];
    const key2 = computeSpy.mock.calls[1][0];
    expect(key1).not.toBe(key2);
  });

  // AC-SC-12: When commitSha is omitted, caching is bypassed
  it("bypasses caching when commitSha is omitted", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute");

    const cached = new CachedArchitectureScannerService(inner, cache);
    const llm = mockLlm();

    const result = await cached.scan("/tmp/work/test-repo", llm);

    expect(result.success).toBe(true);
    // Inner scanner called directly (no caching)
    expect(inner.scan).toHaveBeenCalledOnce();
    // Cache should NOT be consulted
    expect(computeSpy).not.toHaveBeenCalled();
  });

  it("bypasses caching when commitSha is undefined explicitly", async () => {
    const inner = mockInner();
    const cached = new CachedArchitectureScannerService(inner, disabledCache());
    const llm = mockLlm();

    await cached.scan("/tmp/work/test-repo", llm, undefined);

    expect(inner.scan).toHaveBeenCalledOnce();
  });

  it("delegates to inner scanner when cache is disabled", async () => {
    const inner = mockInner();
    const cached = new CachedArchitectureScannerService(inner, disabledCache());
    const llm = mockLlm();

    // Even with commitSha, disabled cache just calls getOrCompute which calls compute
    const result = await cached.scan("/tmp/work/test-repo", llm, "abc123");

    expect(result.success).toBe(true);
    expect(inner.scan).toHaveBeenCalledOnce();
  });

  it("propagates errors from inner scanner without caching them", async () => {
    const inner = mockInner(makeFailureResult());
    const config = enabledConfig();
    const cache = new FileCache(config);
    // Simulate getOrCompute running the compute function
    vi.spyOn(cache, "getOrCompute").mockImplementation(async (_key, compute) => {
      return compute();
    });

    const cached = new CachedArchitectureScannerService(inner, cache);
    const llm = mockLlm();

    const result = await cached.scan("/tmp/work/test-repo", llm, "abc123");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("ARCH_SCANNER_FAILED");
    }
  });

  it("uses cache key with architecture-scanner/scan prefix", async () => {
    const inner = mockInner();
    const config = enabledConfig();
    const cache = new FileCache(config);
    const computeSpy = vi.spyOn(cache, "getOrCompute").mockImplementation(
      async (_key, compute) => compute(),
    );

    const cached = new CachedArchitectureScannerService(inner, cache);
    const llm = mockLlm();

    await cached.scan("/tmp/work/test-repo", llm, "abc123");

    const key = computeSpy.mock.calls[0][0];
    expect(key).toMatch(/^architecture-scanner\/scan\//);
  });
});
