import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { readProjectConfig } from "$lib/server/projects.js";
import { createIsvCalculationFromConfig } from "@isv/pipelines";

/**
 * POST /api/calculate
 *
 * Triggers an ISV calculation for a single ticket using the IsvCalculationPipeline.
 *
 * Request body:
 *   { projectSlug: string, ticketId: string }
 *
 * The pipeline requires configured client adapters (Git, Jira, LLM).
 * The endpoint reads project-config.json for the given projectSlug, instantiates
 * all clients and services via the config-based factory, runs the pipeline, and
 * returns the enriched result.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { ticketId, projectSlug } = body as {
    ticketId?: string;
    projectSlug?: string;
  };

  if (!ticketId || !projectSlug) {
    return json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Both ticketId and projectSlug are required",
          source: "web-api",
        },
      },
      { status: 400 },
    );
  }

  // Read project config
  const projectConfig = await readProjectConfig(projectSlug);
  if (!projectConfig) {
    return json(
      {
        success: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: `Project "${projectSlug}" not found or has invalid configuration`,
          source: "web-api",
        },
      },
      { status: 404 },
    );
  }

  // Create pipeline from config
  const factoryResult = await createIsvCalculationFromConfig(projectConfig);
  if (!factoryResult.success) {
    const status = factoryResult.error.code === "INVALID_PROJECT_CONFIG" ? 400 : 500;
    return json(
      { success: false, error: factoryResult.error },
      { status },
    );
  }

  const { pipeline, cleanup } = factoryResult.data;

  try {
    // Extract pipeline config from project config
    const pipelineConfig = projectConfig.pipeline as
      | Record<string, unknown>
      | undefined;
    const d3QualityFloor = (pipelineConfig?.d3QualityFloor as 1 | 2 | 3 | undefined) ?? undefined;

    // Run the pipeline
    const result = await pipeline.run(ticketId, { d3QualityFloor });

    if (!result.success) {
      const status = result.error.code === "TICKET_NOT_FOUND" ? 404 : 500;
      return json(
        { success: false, error: result.error },
        { status },
      );
    }

    return json({ success: true, data: result.data });
  } finally {
    await cleanup();
  }
};
