import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { purgeProjectCache } from "./cache-purge.js";

// ---------------------------------------------------------------------------
// Mock node:fs and node:fs/promises
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("purgeProjectCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the cache directory when it exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = await purgeProjectCache("test-project", "/repo-root");

    expect(result.purged).toBe(true);
    expect(result.cacheDir).toBe("/repo-root/data/test-project/cache");
    expect(rm).toHaveBeenCalledWith(
      "/repo-root/data/test-project/cache",
      { recursive: true },
    );
  });

  it("returns purged:false when cache directory does not exist (idempotent)", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await purgeProjectCache("test-project", "/repo-root");

    expect(result.purged).toBe(false);
    expect(result.cacheDir).toBe("/repo-root/data/test-project/cache");
    expect(rm).not.toHaveBeenCalled();
  });

  it("resolves correct path from cwd and project slug", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = await purgeProjectCache("unicef", "/home/user/projects");

    expect(result.cacheDir).toBe("/home/user/projects/data/unicef/cache");
  });
});
