import type { PageServerLoad } from "./$types.js";
import { listCalibrationReports } from "$lib/server/reports.js";
import { error } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params }) => {
  const { project } = params;

  // Basic slug validation
  if (!/^[\w-]+$/.test(project)) {
    error(400, "Invalid project slug");
  }

  const reports = await listCalibrationReports(project);

  return {
    projectSlug: project,
    reports,
  };
};
