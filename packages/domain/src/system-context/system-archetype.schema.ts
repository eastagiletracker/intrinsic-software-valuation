import { z } from "zod";

/**
 * System archetype classification for a repository.
 *
 * Determined by the Architecture Scanner (LLM) based on code analysis.
 * Used to select appropriate pattern recognition strategies in gap analysis.
 */
export const SystemArchetypeSchema = z
  .enum([
    "HEADLESS_FRONTEND",
    "CMS_DXP",
    "MIDDLEWARE",
    "BACKEND_SERVICE",
    "UNKNOWN",
  ])
  .describe(
    "Primary system type classification — " +
      "HEADLESS_FRONTEND: UI-only consuming APIs, " +
      "CMS_DXP: content management or digital experience platform, " +
      "MIDDLEWARE: integration or orchestration layer, " +
      "BACKEND_SERVICE: API or business logic server, " +
      "UNKNOWN: cannot be clearly classified",
  );

export type SystemArchetype = z.infer<typeof SystemArchetypeSchema>;
