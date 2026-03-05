/**
 * Server-side utility for scanning calibration report files.
 *
 * Reports are read from:
 *   data/<projectSlug>/calibration/report-YYYY-MM_YYYY-MM.json
 *
 * This module is read-only — it never modifies report files.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { CalibrationRunOutput } from "@isv/domain";
import { dataDir } from "./paths.js";

/** Pattern that matches canonical report filenames. */
const REPORT_PATTERN = /^report-(\d{4}-\d{2})_(\d{4}-\d{2})\.json$/;

/** Summary metadata for one report, used in the index listing (AC-2). */
export interface CalibrationReportEntry {
  /** Filename without extension, e.g. "report-2025-01_2026-01" */
  slug: string;
  /** Full filename, e.g. "report-2025-01_2026-01.json" */
  filename: string;
  /** Start of calibration period (YYYY-MM). */
  periodStart: string;
  /** End of calibration period (YYYY-MM). */
  periodEnd: string;
  /** File modification time (ISO string). */
  createdAt: string;
  /** Number of clusters in the calibration run. */
  sampleSize: number;
  /** Overall fit assessment badge. */
  fitAssessment: "strong" | "moderate" | "weak";
  /** R² value. */
  rSquared: number;
}

/** Build path to a project's calibration directory. */
function calibrationDir(projectSlug: string): string {
  return join(dataDir(), projectSlug, "calibration");
}

/**
 * List all calibration report entries for a project.
 *
 * Reads each report file to extract summary metadata for the index listing.
 * Returns entries sorted by periodEnd descending (newest first).
 */
export async function listCalibrationReports(
  projectSlug: string,
): Promise<CalibrationReportEntry[]> {
  const dir = calibrationDir(projectSlug);

  let filenames: string[];
  try {
    filenames = await readdir(dir);
  } catch {
    return [];
  }

  const reports: CalibrationReportEntry[] = [];

  for (const filename of filenames) {
    const match = REPORT_PATTERN.exec(filename);
    if (!match) continue;

    const [, periodStart, periodEnd] = match;
    const filePath = join(dir, filename);

    try {
      const [raw, fileStat] = await Promise.all([
        readFile(filePath, "utf-8"),
        stat(filePath),
      ]);
      const data = JSON.parse(raw) as CalibrationRunOutput;
      const result = data.result;

      reports.push({
        slug: filename.replace(/\.json$/, ""),
        filename,
        periodStart,
        periodEnd,
        createdAt: fileStat.mtime.toISOString(),
        sampleSize: result.sampleSize,
        fitAssessment: result.formulaValidation.fitAssessment,
        rSquared: result.rSquared,
      });
    } catch {
      // Skip malformed or unreadable files
      console.warn(`[isv-web] Skipping malformed report file: ${filename}`);
    }
  }

  return reports.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

/**
 * Read and parse a single calibration report file.
 *
 * @param projectSlug - Project slug.
 * @param reportSlug  - Report slug (filename without .json extension).
 * @returns Parsed CalibrationRunOutput, or null if not found / invalid.
 */
export async function readCalibrationReport(
  projectSlug: string,
  reportSlug: string,
): Promise<CalibrationRunOutput | null> {
  const filePath = join(calibrationDir(projectSlug), `${reportSlug}.json`);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as CalibrationRunOutput;
  } catch {
    return null;
  }
}
