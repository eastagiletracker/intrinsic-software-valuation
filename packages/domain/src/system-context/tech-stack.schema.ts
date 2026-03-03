import { z } from "zod";

/**
 * Technology stack of a repository.
 *
 * Extracted by the Architecture Scanner to capture languages, frameworks,
 * and infrastructure concepts. Used by the Gap Analyzer to assess whether
 * existing technologies are sufficient for new requirements.
 */
export const TechStackSchema = z
  .object({
    languages: z
      .array(z.string())
      .describe("Primary programming languages, e.g. ['TypeScript', 'Java']"),
    frameworks: z
      .array(z.string())
      .describe(
        "Core frameworks and libraries, e.g. ['Next.js', 'Spring Boot', 'Magnolia']",
      ),
    infrastructure: z
      .array(z.string())
      .describe(
        "Infrastructure and platform concepts, e.g. ['Docker', 'Kubernetes', 'AWS Lambda']",
      ),
  })
  .describe(
    "Technology stack summary: languages, frameworks, and infrastructure concepts " +
      "extracted from source code analysis.",
  );

export type TechStack = z.infer<typeof TechStackSchema>;
