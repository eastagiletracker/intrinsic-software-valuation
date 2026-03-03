import { z } from "zod";

import { RepositoryRefSchema } from "../shared/repository-ref.schema.js";
import { SystemArchetypeSchema } from "./system-archetype.schema.js";
import { TechStackSchema } from "./tech-stack.schema.js";
import { AdapterCatalogSchema } from "./adapter-catalog.schema.js";
import { CorePatternSchema } from "./core-pattern.schema.js";

/**
 * Machine-readable architecture baseline for a single repository.
 *
 * Produced by the Architecture Scanner (LLM-assisted, phase 1) by analyzing
 * source code. Captures structural capabilities: system type, tech stack,
 * integration points, established patterns, and domain models.
 *
 * This is the qualitative half of the Fact Finder output.
 * The quantitative half is the CodeHealthReport from the Status Quo Miner.
 *
 * The Gap Analyzer compares this baseline with a new ticket to identify
 * structural gaps and derive ISV factors.
 */
export const SystemContextSchema = z
  .object({
    repository: RepositoryRefSchema.describe(
      "The repository this system context was extracted from",
    ),
    systemArchetype: SystemArchetypeSchema,
    archetypeReasoning: z
      .string()
      .describe(
        "1-2 sentence justification for the chosen system archetype classification",
      ),
    techStack: TechStackSchema,
    adapterCatalog: AdapterCatalogSchema,
    corePatterns: z
      .array(CorePatternSchema)
      .describe(
        "Architecture patterns and capabilities identified in this repository",
      ),
    domainModels: z
      .array(z.string())
      .describe(
        "Central domain entities or content types, e.g. ['Order', 'User', 'Article']. " +
          "May be empty for pure middleware or UI frontends.",
      ),
  })
  .describe(
    "Architecture baseline for a single repository produced by the Architecture Scanner. " +
      "Captures system archetype, tech stack, adapters, patterns, and domain models. " +
      "Input for the Gap Analyzer to detect structural gaps against new requirements.",
  );

export type SystemContext = z.infer<typeof SystemContextSchema>;
