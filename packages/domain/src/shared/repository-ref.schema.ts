import { z } from "zod";

/**
 * Reference to a source code repository.
 *
 * Used as input for Git operations (checkout, log analysis) across the
 * Fact Finder and Calibration phases. The ISV Engine operates on n repositories
 * per analysis run — each is identified by a RepositoryRef.
 */
export const RepositoryRefSchema = z
  .object({
    repositoryId: z
      .string()
      .min(1)
      .describe(
        'Human-readable identifier for the repository, e.g. "frontend-app" or "backend-service"',
      ),
    url: z
      .string()
      .refine(
        (v) =>
          /^https?:\/\/.+/.test(v) || /^git@[^:]+:.+/.test(v),
        { message: "Must be an HTTPS URL or SSH URL (git@host:path)" },
      )
      .optional()
      .describe(
        'Git remote URL for cloning (HTTPS or SSH), e.g. "https://github.com/org/repo.git" or "git@github.com:org/repo.git"',
      ),
    localPath: z
      .string()
      .optional()
      .describe(
        "Absolute path to local checkout directory, if already available on disk",
      ),
  })
  .describe(
    "Reference to a source code repository used for analysis. " +
      "Provides either a remote URL for cloning or a local path to an existing checkout.",
  );

export type RepositoryRef = z.infer<typeof RepositoryRefSchema>;
