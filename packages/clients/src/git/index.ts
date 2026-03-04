// Git client — port (stable interface) and adapter implementation.
export type { GitPort } from "./port.js";
export type {
  PreparedRepo,
  WorkingTree,
  LogStatsOptions,
  GitLogStats,
} from "./port.js";
export { GitWorktreeAdapter } from "./git-worktree.adapter.js";

// High-level client, schema, and factory.
export type { GitClient } from "./client.js";
export {
  GitClientConfigSchema,
  type GitClientConfig,
} from "./client-config.schema.js";
export { createGitClient } from "./factory.js";
