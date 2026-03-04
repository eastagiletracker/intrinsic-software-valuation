import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createGitClient } from "./factory.js";

describe("createGitClient", () => {
  const BASE_PATH = resolve("data", "test-git-factory", "git");

  afterEach(async () => {
    await rm(BASE_PATH, { recursive: true, force: true });
  });

  it("rejects duplicate repositoryIds", async () => {
    await expect(
      createGitClient({
        repositories: [
          {
            repositoryId: "dup",
            url: "https://github.com/org/repo.git",
          },
          {
            repositoryId: "dup",
            url: "https://github.com/org/other.git",
          },
        ],
        dataFolderName: "test-git-factory",
      }),
    ).rejects.toMatchObject({
      code: "DUPLICATE_REPOSITORY_ID",
      source: "git-client",
    });
  });

  it("creates a client from a local path (this repo)", async () => {
    const client = await createGitClient({
      repositories: [
        {
          repositoryId: "self",
          localPath: resolve("."),
        },
      ],
      dataFolderName: "test-git-factory",
    });

    expect(client.repositoryIds()).toEqual(["self"]);
    await client.destroy();
  });

  it("rejects a non-existent local path", async () => {
    await expect(
      createGitClient({
        repositories: [
          {
            repositoryId: "missing",
            localPath: "/tmp/does-not-exist-xyz-123",
          },
        ],
        dataFolderName: "test-git-factory",
      }),
    ).rejects.toMatchObject({
      code: "GIT_CLONE_FAILED",
      source: "git-client",
    });
  });
});
