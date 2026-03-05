import type { PageServerLoad } from "./$types.js";
import { readCalibrationReport } from "$lib/server/reports.js";
import { readProjectConfig } from "$lib/server/projects.js";
import { error } from "@sveltejs/kit";

/** Default daily rate in € (8-hour day) when project config has none. */
const DEFAULT_DAILY_RATE = 1000;

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

  // Read legacy daily rate from project config (falls back to default)
  const config = await readProjectConfig(project);
  const projectSection = config?.project as Record<string, unknown> | undefined;
  const rawRate = projectSection?.legacyDailyRate;
  const legacyDailyRate =
    typeof rawRate === "number" && rawRate > 0 ? rawRate : DEFAULT_DAILY_RATE;

  return {
    projectSlug: project,
    reportSlug,
    report,
    legacyDailyRate,
  };
};
