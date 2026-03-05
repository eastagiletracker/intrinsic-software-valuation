/**
 * Report writer — persists a CalibrationRunOutput as a JSON report file.
 *
 * The report is written to:
 *   data/<projectSlug>/calibration/report-<periodStart>_<periodEnd>.json
 *
 * where periodStart and periodEnd are taken from the CalibrationResult
 * (format YYYY-MM).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CalibrationRunOutput } from "@isv/domain";

/**
 * Build the canonical report filename from the calibration period.
 *
 * @param periodStart - Start month (YYYY-MM).
 * @param periodEnd   - End month (YYYY-MM).
 * @returns Filename like `report-2025-01_2026-01.json`.
 */
export function reportFilename(
  periodStart: string,
  periodEnd: string,
): string {
  return `report-${periodStart}_${periodEnd}.json`;
}

/**
 * Write a CalibrationRunOutput to the canonical report file location.
 *
 * Creates the `calibration/` directory if it does not exist.
 *
 * @param output       - The complete calibration run output.
 * @param projectSlug  - Project slug (scopes to `data/<projectSlug>/`).
 * @param cwd          - Monorepo root directory.
 * @returns The absolute path of the written report file.
 */
export async function writeCalibrationReport(
  output: CalibrationRunOutput,
  projectSlug: string,
  cwd: string,
): Promise<string> {
  const { periodStart, periodEnd } = output.result;
  const dir = join(cwd, "data", projectSlug, "calibration");
  await mkdir(dir, { recursive: true });

  const filename = reportFilename(periodStart, periodEnd);
  const filePath = join(dir, filename);
  await writeFile(filePath, JSON.stringify(output, null, 2), "utf-8");

  return filePath;
}
