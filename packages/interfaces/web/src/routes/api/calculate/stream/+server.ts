import { json } from "@sveltejs/kit";
import { join } from "node:path";
import type { RequestHandler } from "./$types.js";
import { readProjectConfig } from "$lib/server/projects.js";
import { createIsvCalculationFromConfig } from "@isv/pipelines";
import type { PipelineProgressEvent } from "@isv/pipelines";

/** Resolve the monorepo root (three levels above the SvelteKit package root). */
function monorepoRoot(): string {
  return join(process.cwd(), "..", "..", "..");
}

/**
 * GET /api/calculate/stream
 *
 * SSE endpoint that runs the ISV calculation pipeline and streams progress
 * events to the client. Each `onProgress` callback is translated into an
 * SSE `data:` line. The final result is emitted as `event: done` and errors
 * as `event: error`.
 *
 * Query parameters:
 *   ticketId    — The ticket to calculate ISV for.
 *   projectSlug — The project folder name inside data/.
 */
export const GET: RequestHandler = async ({ url }) => {
  const ticketId = url.searchParams.get("ticketId")?.trim();
  const projectSlug = url.searchParams.get("projectSlug")?.trim();

  if (!ticketId || !projectSlug) {
    return json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Both ticketId and projectSlug query parameters are required",
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
  const factoryResult = await createIsvCalculationFromConfig(projectConfig, {
    cwd: monorepoRoot(),
  });
  if (!factoryResult.success) {
    const status =
      factoryResult.error.code === "INVALID_PROJECT_CONFIG" ? 400 : 500;
    return json(
      { success: false, error: factoryResult.error },
      { status },
    );
  }

  const { pipeline, cleanup } = factoryResult.data;

  // Extract pipeline config
  const pipelineConfig = projectConfig.pipeline as
    | Record<string, unknown>
    | undefined;
  const rawFloor = pipelineConfig?.d3QualityFloor;
  const d3QualityFloor =
    rawFloor === 1 || rawFloor === 2 || rawFloor === 3
      ? rawFloor
      : undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      /** Write a raw SSE frame to the stream. */
      function write(text: string): void {
        controller.enqueue(encoder.encode(text));
      }

      /** Format and write an SSE event (unnamed data-only, or named event). */
      function writeSSE(data: unknown, event?: string): void {
        const payload = JSON.stringify(data);
        write(event ? `event: ${event}\ndata: ${payload}\n\n` : `data: ${payload}\n\n`);
      }

      /** Progress callback — each event becomes an SSE data line. */
      function onProgress(event: PipelineProgressEvent): void {
        writeSSE(event);
      }

      // Run the pipeline asynchronously
      pipeline
        .run(ticketId, { d3QualityFloor }, onProgress)
        .then((result) => {
          if (result.success) {
            writeSSE({ success: true, data: result.data }, "done");
          } else {
            writeSSE({ code: result.error.code, message: result.error.message, source: result.error.source }, "error");
          }
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error ? err.message : String(err);
          writeSSE({ code: "PIPELINE_ERROR", message, source: "web-api" }, "error");
        })
        .finally(async () => {
          await cleanup();
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
