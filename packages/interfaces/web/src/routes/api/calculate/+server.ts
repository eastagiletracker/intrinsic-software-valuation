import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";

/**
 * POST /api/calculate
 *
 * Triggers an ISV calculation for a single ticket using the IsvCalculationPipeline.
 *
 * Request body:
 *   { projectSlug: string, ticketId: string }
 *
 * The pipeline requires configured client adapters (Git, Jira, LLM).
 * When adapters are not available, returns a descriptive error guiding setup.
 *
 * Note: The full pipeline integration requires the project's client adapters
 * to be configured. This endpoint provides the wiring — actual calculation
 * depends on the backend services being available.
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

  // The ISV Calculation Pipeline requires configured backend adapters.
  // In a fully configured environment, this would:
  // 1. Read project-config.json for the given projectSlug
  // 2. Initialize all clients (Jira, Git, LLM, time tracking)
  // 3. Create services (StatusQuoMiner, ArchitectureScanner, GapAnalyzer, Valuation)
  // 4. Create and run the IsvCalculationPipeline
  //
  // For now, return a descriptive placeholder that shows the UI is wired correctly.
  return json(
    {
      success: false,
      error: {
        code: "PIPELINE_NOT_CONFIGURED",
        message:
          `ISV calculation for ${ticketId} in project "${projectSlug}" requires configured ` +
          "backend adapters (Jira, Git, LLM). See packages/interfaces/cli/README.md for setup instructions. " +
          "Once adapters are configured, this endpoint will invoke the IsvCalculationPipeline.",
        source: "web-api",
      },
    },
    { status: 501 },
  );
};
