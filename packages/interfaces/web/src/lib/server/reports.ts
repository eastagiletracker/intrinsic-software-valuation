/**
 * Server-side utility for scanning calibration report files.
 *
 * Reports are read from:
 *   data/<projectSlug>/calibration/report-<periodStart>_<periodEnd>.json
 *
 * This module is read-only — it never modifies report files.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { CalibrationRunOutput } from "@isv/domain";
import { dataDir } from "./paths.js";

/** Pattern that matches report files while preventing unrelated JSON files. */
const REPORT_PATTERN = /^report-(.+)_(.+)\.json$/;

/** Summary metadata for one report, used in the index listing (AC-2). */
export interface CalibrationReportEntry {
  /** Filename without extension, e.g. "report-2025-01_2026-01" or timestamp variants. */
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

/** Build path to a project's shared cache directory. */
function cacheDir(projectSlug: string): string {
  return join(dataDir(), projectSlug, "cache");
}

/** Read JSON files from a cache leaf directory and include file metadata. */
async function readCacheJsonFiles(dir: string): Promise<
  Array<{ filename: string; createdAt: string; data: unknown }>
> {
  let filenames: string[];
  try {
    filenames = await readdir(dir);
  } catch {
    return [];
  }

  const jsonFiles = filenames.filter((name) => name.endsWith(".json"));
  const entries = await Promise.all(
    jsonFiles.map(async (filename) => {
      const filePath = join(dir, filename);
      try {
        const [raw, fileStat] = await Promise.all([
          readFile(filePath, "utf-8"),
          stat(filePath),
        ]);
        return {
          filename,
          createdAt: fileStat.mtime.toISOString(),
          data: JSON.parse(raw) as unknown,
        };
      } catch {
        return null;
      }
    }),
  );

  return entries.filter((entry) => entry !== null);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function repositoryIdFromPayload(payload: unknown): string | null {
  const obj = asObject(payload);
  const repository = asObject(obj?.repository);
  const repositoryId = repository?.repositoryId;
  return typeof repositoryId === "string" ? repositoryId : null;
}

function parseIsoTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
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
        // Trust report payload values so both YYYY-MM and ISO timestamp filenames work.
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
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

export interface CachedSnapshotEntry {
  repositoryId: string;
  cacheFile: string;
  createdAt: string;
  observedAt?: string;
  data: unknown;
}

export interface CachedGapAnalysisEntry {
  ticketId: string;
  cacheFile: string;
  createdAt: string;
  data: unknown;
}

export interface ClusterCacheDetails {
  clusterId: string;
  clusterIds: string[];
  gapAnalysis: CachedGapAnalysisEntry | null;
  architectureScanner: {
    entries: CachedSnapshotEntry[];
  };
  statusQuoMiner: {
    entries: CachedSnapshotEntry[];
  };
}

/**
 * Resolve cache-backed details for one cluster within one calibration report.
 *
 * Strategy:
 * - Gap Analyzer: find most recent cache entry where payload.ticketId matches
 *   one of the cluster IDs.
 * - Architecture Scanner: return newest entry per repositoryId.
 * - Status Quo Miner: return nearest-in-time entry per repositoryId using
 *   cluster.metadata.timestampT0 as anchor.
 */
export async function readClusterCacheDetails(
  projectSlug: string,
  reportSlug: string,
  clusterId: string,
): Promise<ClusterCacheDetails | null> {
  const report = await readCalibrationReport(projectSlug, reportSlug);
  if (!report) return null;

  const cluster = report.clusters.find((entry) => entry.clusterId === clusterId);
  if (!cluster) return null;

  const base = cacheDir(projectSlug);
  const [gapFiles, archFiles, mineFiles] = await Promise.all([
    readCacheJsonFiles(join(base, "gap-analyzer", "analyze")),
    readCacheJsonFiles(join(base, "architecture-scanner", "scan")),
    readCacheJsonFiles(join(base, "status-quo-miner", "mine")),
  ]);

  const clusterTicketIds = new Set(cluster.ids);

  // Most recent gap-analysis payload for this cluster (if present)
  const matchingGap = gapFiles
    .map((entry) => {
      const obj = asObject(entry.data);
      const ticketId = obj?.ticketId;
      if (typeof ticketId !== "string" || !clusterTicketIds.has(ticketId)) {
        return null;
      }
      return {
        ticketId,
        cacheFile: entry.filename,
        createdAt: entry.createdAt,
        data: entry.data,
      } satisfies CachedGapAnalysisEntry;
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  // Newest architecture snapshot per repository.
  const latestArchitectureByRepo = new Map<string, CachedSnapshotEntry>();
  for (const entry of archFiles) {
    const repositoryId = repositoryIdFromPayload(entry.data);
    if (!repositoryId) continue;
    const current = latestArchitectureByRepo.get(repositoryId);
    if (!current || current.createdAt < entry.createdAt) {
      latestArchitectureByRepo.set(repositoryId, {
        repositoryId,
        cacheFile: entry.filename,
        createdAt: entry.createdAt,
        data: entry.data,
      });
    }
  }

  // Nearest status-quo snapshot per repository to the cluster timestamp.
  const clusterTimeMs = parseIsoTime(cluster.metadata.timestampT0);
  const bestMineByRepo = new Map<string, { distance: number; item: CachedSnapshotEntry }>();
  for (const entry of mineFiles) {
    const repositoryId = repositoryIdFromPayload(entry.data);
    if (!repositoryId) continue;

    const payload = asObject(entry.data);
    const observedAtRaw = payload?.timestamp;
    const observedAtMs = parseIsoTime(observedAtRaw);
    const distance =
      clusterTimeMs != null && observedAtMs != null
        ? Math.abs(clusterTimeMs - observedAtMs)
        : Number.MAX_SAFE_INTEGER;

    const item: CachedSnapshotEntry = {
      repositoryId,
      cacheFile: entry.filename,
      createdAt: entry.createdAt,
      observedAt: typeof observedAtRaw === "string" ? observedAtRaw : undefined,
      data: entry.data,
    };

    const current = bestMineByRepo.get(repositoryId);
    if (!current || distance < current.distance) {
      bestMineByRepo.set(repositoryId, { distance, item });
    }
  }

  return {
    clusterId: cluster.clusterId,
    clusterIds: cluster.ids,
    gapAnalysis: matchingGap,
    architectureScanner: {
      entries: Array.from(latestArchitectureByRepo.values()).sort((a, b) =>
        a.repositoryId.localeCompare(b.repositoryId),
      ),
    },
    statusQuoMiner: {
      entries: Array.from(bestMineByRepo.values())
        .map((entry) => entry.item)
        .sort((a, b) => a.repositoryId.localeCompare(b.repositoryId)),
    },
  };
}
