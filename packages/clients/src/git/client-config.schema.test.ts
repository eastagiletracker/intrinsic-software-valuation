import { describe, expect, it } from "vitest";

import { GitClientConfigSchema } from "./client-config.schema.js";

describe("GitClientConfigSchema", () => {
  const valid = {
    repositories: [
      { repositoryId: "frontend", url: "https://github.com/org/frontend.git" },
    ],
    dataFolderName: "superclient",
  };

  it("accepts a valid config with a remote URL", () => {
    expect(GitClientConfigSchema.parse(valid)).toEqual(valid);
  });

  it("accepts a config with a localPath", () => {
    const config = {
      repositories: [
        { repositoryId: "backend", localPath: "/opt/repos/backend" },
      ],
      dataFolderName: "superclient",
    };
    expect(GitClientConfigSchema.parse(config)).toEqual(config);
  });

  it("accepts a config with multiple repositories", () => {
    const config = {
      repositories: [
        {
          repositoryId: "frontend",
          url: "https://github.com/org/frontend.git",
        },
        { repositoryId: "backend", localPath: "/opt/repos/backend" },
      ],
      dataFolderName: "superclient",
    };
    expect(GitClientConfigSchema.parse(config)).toEqual(config);
  });

  it("rejects an empty repositories array", () => {
    expect(() =>
      GitClientConfigSchema.parse({ ...valid, repositories: [] }),
    ).toThrow();
  });

  it("rejects an empty dataFolderName", () => {
    expect(() =>
      GitClientConfigSchema.parse({ ...valid, dataFolderName: "" }),
    ).toThrow();
  });

  it("rejects a missing repositories field", () => {
    expect(() =>
      GitClientConfigSchema.parse({ dataFolderName: "superclient" }),
    ).toThrow();
  });

  it("rejects a missing dataFolderName field", () => {
    expect(() =>
      GitClientConfigSchema.parse({ repositories: valid.repositories }),
    ).toThrow();
  });
});
