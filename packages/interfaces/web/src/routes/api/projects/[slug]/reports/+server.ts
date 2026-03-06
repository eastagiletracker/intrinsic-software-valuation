import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import {
  listCalibrationReports,
  readClusterCacheDetails,
} from "$lib/server/reports.js";

/**
 * GET /api/projects/[slug]/reports
 *
 * Returns the list of calibration reports for a given project.
 */
export const GET: RequestHandler = async ({ params, url }) => {
  const { slug } = params;

  if (!/^[\w-]+$/.test(slug)) {
    error(400, "Invalid project slug");
  }

  const reportSlug = url.searchParams.get("reportSlug");
  const clusterId = url.searchParams.get("clusterId");

  if ((reportSlug && !clusterId) || (!reportSlug && clusterId)) {
    error(400, "Both reportSlug and clusterId must be provided together");
  }

  // Detail mode: GET /api/projects/:slug/reports?reportSlug=...&clusterId=...
  if (reportSlug && clusterId) {
    const details = await readClusterCacheDetails(slug, reportSlug, clusterId);
    if (!details) {
      error(404, "Cluster or report not found");
    }
    return json({ success: true, data: details });
  }

  // List mode: GET /api/projects/:slug/reports
  const reports = await listCalibrationReports(slug);
  return json({ success: true, data: reports });
};
