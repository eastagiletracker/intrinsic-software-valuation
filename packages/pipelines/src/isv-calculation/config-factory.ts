import type { Result } from "@isv/domain";
import {
  createTicketClient,
  createGitClient,
  createLlmClient,
  createStaticAnalysisClient,
} from "@isv/clients";
import {
  createStatusQuoMiner,
  createArchitectureScanner,
  createGapAnalyzer,
  createValuationService,
} from "@isv/services";

import type { IsvCalculationPipelinePort } from "./port.js";
import { createIsvCalculationPipeline } from "./pipeline.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of the config-based factory: a runnable pipeline and a cleanup function. */
export interface ConfigFactoryResult {
  pipeline: IsvCalculationPipelinePort;
  /** Call in a `finally` block to release Git worktrees and other resources. */
  cleanup: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the project config contains the required sections for
 * pipeline instantiation. Returns a descriptive error result on failure.
 */
function validateConfig(
  config: Record<string, unknown>,
): Result<void> {
  const missing: string[] = [];
  if (!config.jira || typeof config.jira !== "object") missing.push("jira");
  if (!config.git || typeof config.git !== "object") missing.push("git");
  if (!config.llm || typeof config.llm !== "object") missing.push("llm");

  if (missing.length > 0) {
    return {
      success: false,
      error: {
        code: "INVALID_PROJECT_CONFIG",
        message: `Project config is missing required section(s): ${missing.join(", ")}`,
        source: "config-factory",
      },
    };
  }

  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an ISV Calculation Pipeline from a raw `project-config.json` object.
 *
 * This is the single entry point the web endpoint uses. It encapsulates all
 * `@isv/clients` and `@isv/services` imports so the web package only depends
 * on `@isv/pipelines` and `@isv/domain`.
 *
 * @param projectConfig - The raw parsed `project-config.json` object.
 * @returns A `Result` containing the pipeline and a cleanup function, or a
 *   structured error if the config is invalid or client creation fails.
 */
export async function createIsvCalculationFromConfig(
  projectConfig: Record<string, unknown>,
): Promise<Result<ConfigFactoryResult>> {
  // Validate required sections
  const validation = validateConfig(projectConfig);
  if (!validation.success) return validation;

  try {
    const jiraConfig = projectConfig.jira as Record<string, unknown>;
    const gitConfig = projectConfig.git as Record<string, unknown>;
    const llmConfig = projectConfig.llm as Record<string, unknown>;
    const projectMeta = projectConfig.project as
      | Record<string, unknown>
      | undefined;

    const dataFolderName =
      (jiraConfig.dataFolderName as string | undefined) ??
      (gitConfig.dataFolderName as string | undefined) ??
      (projectMeta?.dataFolderName as string | undefined) ??
      (projectMeta?.slug as string | undefined) ??
      "";

    // Validate required field: ticketPrefix
    const ticketPrefix =
      (jiraConfig.ticketPrefix as string | undefined) ??
      (projectMeta?.ticketPrefix as string | undefined) ??
      "";

    if (!ticketPrefix) {
      return {
        success: false,
        error: {
          code: "INVALID_PROJECT_CONFIG",
          message:
            "Project config is missing ticketPrefix in jira or project section",
          source: "config-factory",
        },
      };
    }

    // 1. Create clients
    const ticketClient = await createTicketClient({
      dataFolderName:
        (jiraConfig.dataFolderName as string | undefined) ?? dataFolderName,
      ticketPrefix,
      rawFormat: (jiraConfig.rawFormat as "jira-xml") ?? "jira-xml",
    });

    const gitClient = await createGitClient({
      repositories: (gitConfig.repositories as Array<{
        repositoryId: string;
        url?: string;
        localPath?: string;
      }>) ?? [],
      dataFolderName:
        (gitConfig.dataFolderName as string | undefined) ?? dataFolderName,
    });

    const llmClient = createLlmClient({
      provider:
        (llmConfig.provider as "github-copilot-cli") ?? "github-copilot-cli",
      timeoutMs: llmConfig.timeoutMs as number | undefined,
      cwd: llmConfig.cwd as string | undefined,
    });

    // 2. Create static analysis client (no config needed)
    const staticAnalysis = createStaticAnalysisClient();

    // 3. Create services
    const statusQuoMiner = createStatusQuoMiner(staticAnalysis, gitClient);
    const architectureScanner = createArchitectureScanner();
    const gapAnalyzer = createGapAnalyzer();
    const valuation = createValuationService();

    // 4. Assemble pipeline
    const pipeline = createIsvCalculationPipeline({
      ticketClient,
      gitClient,
      llmClient,
      statusQuoMiner,
      architectureScanner,
      gapAnalyzer,
      valuation,
    });

    // 5. Cleanup function
    const cleanup = async () => {
      await gitClient.releaseAll();
    };

    return { success: true, data: { pipeline, cleanup } };
  } catch (err) {
    return {
      success: false,
      error: {
        code: "PIPELINE_INIT_FAILED",
        message: err instanceof Error ? err.message : String(err),
        source: "config-factory",
      },
    };
  }
}
