/**
 * Shared path utilities for the ISV Web server layer.
 *
 * Centralises the monorepo data/ directory resolution so that all
 * server-side modules use a single source of truth.
 */

import { join } from "node:path";

/**
 * Resolve the absolute path to the monorepo data/ directory.
 *
 * SvelteKit dev server runs from the package root (packages/interfaces/web/).
 * The monorepo data/ folder is three levels up.
 */
export function dataDir(): string {
  return join(process.cwd(), "..", "..", "..", "data");
}
