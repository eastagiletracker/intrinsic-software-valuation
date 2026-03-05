import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { listCalibrationReports } from "$lib/server/reports.js";

/**
 * GET /api/projects/[slug]/reports
 *
 * Returns the list of calibration reports for a given project.
 */
export const GET: RequestHandler = async ({ params }) => {
  const { slug } = params;

  if (!/^[\w-]+$/.test(slug)) {
    error(400, "Invalid project slug");
  }

  const reports = await listCalibrationReports(slug);
  return json({ success: true, data: reports });
};
