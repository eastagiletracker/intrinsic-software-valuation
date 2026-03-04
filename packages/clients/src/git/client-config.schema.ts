import { z } from "zod";

import { RepositoryRefSchema } from "@isv/domain";

/**
 * Configuration for initialising a `GitClient`.
 *
 * Provides the project-specific context the factory needs to prepare
 * repositories and locate storage directories on disk.
 */
export const GitClientConfigSchema = z
  .object({
    repositories: z
      .array(RepositoryRefSchema)
      .min(1, "At least one repository is required")
      .describe("List of repositories to manage. At least one required."),
    dataFolderName: z
      .string()
      .min(1)
      .describe(
        'Name of the client data folder inside data/, e.g. "superclient". ' +
          "Resolves to data/<dataFolderName>/git/",
      ),
  })
  .describe("Project-specific configuration for the Git client factory.");

export type GitClientConfig = z.infer<typeof GitClientConfigSchema>;
