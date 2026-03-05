/**
 * Shared types for the ISV Web UI API layer.
 *
 * These types define the shape of data exchanged between SvelteKit server
 * routes and client-side Svelte components. They are serializable (JSON-safe)
 * projections of the domain types from @isv/domain.
 */

/** A project entry derived from a data/ subdirectory with a valid project-config.json. */
export interface ProjectEntry {
  /** Folder name inside data/, e.g. "unicef" */
  slug: string;
  /** Human-readable project name from project-config.json → project.name */
  name: string;
  /** Ticket prefix from project-config.json → project.ticketPrefix, e.g. "UNICEF" */
  ticketPrefix: string;
}

/** Wrapper for API responses. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    source?: string;
  };
}

// ---------------------------------------------------------------------------
// Pipeline progress types (client-side mirrors of @isv/pipelines types)
// ---------------------------------------------------------------------------

/** Visual status of a single pipeline step in the UI. */
export type PipelineStepStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "error"
  | "skipped";

/** Client-side representation of a pipeline step for the progress tracker. */
export interface PipelineStepState {
  id: string;
  label: string;
  status: PipelineStepStatus;
  aiAssisted?: boolean;
  detail?: string;
}
