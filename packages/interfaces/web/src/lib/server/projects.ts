/**
 * Server-side utility for scanning the data/ directory to discover projects.
 *
 * Each subdirectory of data/ that contains a valid project-config.json is
 * considered a project. The config is read for display metadata only — the
 * full config is not exposed to the client.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectEntry } from "$lib/types/index.js";

/** Resolve the absolute path to the monorepo data/ directory. */
function dataDir(): string {
  // SvelteKit dev server runs from the package root (packages/interfaces/web/).
  // The monorepo data/ folder is three levels up.
  return join(process.cwd(), "..", "..", "..", "data");
}

/**
 * Scan data/ for project subdirectories with a valid project-config.json.
 * Returns a sorted list of ProjectEntry objects.
 */
export async function listProjects(): Promise<ProjectEntry[]> {
  const root = dataDir();
  let entries: string[];
  try {
    entries = await readdir(root, { withFileTypes: true }).then((dirents) =>
      dirents.filter((d) => d.isDirectory()).map((d) => d.name),
    );
  } catch {
    // data/ directory does not exist or is unreadable
    console.warn("[isv-web] Could not read data/ directory — sidebar will show empty state");
    return [];
  }

  const projects: ProjectEntry[] = [];

  for (const slug of entries) {
    const configPath = join(root, slug, "project-config.json");
    try {
      const raw = await readFile(configPath, "utf-8");
      const config = JSON.parse(raw);
      const name = config?.project?.name;
      const ticketPrefix = config?.project?.ticketPrefix;
      if (typeof name === "string" && typeof ticketPrefix === "string") {
        projects.push({ slug, name, ticketPrefix });
      }
    } catch {
      // Invalid or missing config — skip this directory
      console.warn(`[isv-web] Skipping data/${slug}: invalid or missing project-config.json`);
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read the full project-config.json for a given project slug.
 * Returns null if the project does not exist or has invalid config.
 */
export async function readProjectConfig(
  slug: string,
): Promise<Record<string, unknown> | null> {
  const configPath = join(dataDir(), slug, "project-config.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
