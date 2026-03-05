import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { listProjects } from "$lib/server/projects.js";

/**
 * GET /api/projects
 *
 * Returns the list of available projects derived from data/ subdirectories
 * that contain a valid project-config.json.
 */
export const GET: RequestHandler = async () => {
  const projects = await listProjects();
  return json({ success: true, data: projects });
};
