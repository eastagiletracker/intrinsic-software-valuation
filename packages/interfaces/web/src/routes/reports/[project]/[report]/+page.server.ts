import type { PageServerLoad } from "./$types.js";
import { readCalibrationReport } from "$lib/server/reports.js";
import { error } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params }) => {
  const { project, report: reportSlug } = params;

  // Basic slug validation
  if (!/^[\w-]+$/.test(project)) {
    error(400, "Invalid project slug");
  }
  if (!/^report-\d{4}-\d{2}_\d{4}-\d{2}$/.test(reportSlug)) {
    error(400, "Invalid report slug");
  }

  const report = await readCalibrationReport(project, reportSlug);

  if (!report) {
    error(404, "Report not found");
  }

  return {
    projectSlug: project,
    reportSlug,
    report,
  };
};
