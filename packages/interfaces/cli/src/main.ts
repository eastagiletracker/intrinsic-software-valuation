#!/usr/bin/env node

/**
 * ISV Engine CLI — entry point.
 *
 * Usage:
 *   isv calculate <ticketId> --project <slug>  — Calculate ISV for a single ticket
 *   isv calibrate --project <slug> [--from <YYYY-MM>] [--to <YYYY-MM>] [--run-id <id>]
 *                 [--concurrency <n>] [--llm-concurrency <n>]
 *   isv calibrate --status --project <slug> [--run-id <id>]
 *   isv init --project <slug>
 *
 * Exit codes:
 *   0 — success
 *   1 — user error (missing arguments, bad usage)
 *   2 — pipeline / runtime error
 */

import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { warmupProjectData } from "@isv/clients";
import type { WarmupProgressEvent } from "@isv/clients";
import type {
  PipelineProgressEvent,
  CalibrationProgressEvent,
} from "@isv/pipelines";
import {
  createIsvCalculationFromConfig,
  createHistoricalCalibrationFromConfig,
  writeCalibrationReport,
  SqliteRunStore,
} from "@isv/pipelines";

// ---------------------------------------------------------------------------
// Monorepo root resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the monorepo root from the CLI package location.
 * packages/interfaces/cli/src/main.ts → 4 levels up to reach the root.
 * Uses import.meta.dirname so the result is stable regardless of process.cwd().
 */
function monorepoRoot(): string {
  return join(import.meta.dirname, "..", "..", "..", "..");
}

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

function findFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ---------------------------------------------------------------------------
// Init command (AC-8)
// ---------------------------------------------------------------------------

async function runInit(args: string[]): Promise<void> {
  const projectSlug = findFlag(args, "--project");
  if (!projectSlug) {
    console.error("Usage: isv init --project <slug>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const dataDir = resolve(cwd, "data", projectSlug);

  // AC-8.1: Create project directory structure
  const dirs = [
    join(dataDir, "calibration-runs"),
    join(dataDir, "git", "repos"),
    join(dataDir, "git", "work"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
  console.log(`✓ Project directories created at data/${projectSlug}/`);

  // AC-8.2 / AC-8.3: Handle project-config.json
  const configPath = join(dataDir, "project-config.json");
  if (!existsSync(configPath)) {
    // Create template config
    const template = {
      project: {
        name: projectSlug,
        slug: projectSlug,
        ticketPrefix: "CHANGE-ME",
      },
      jira: {
        rawFormat: "jira-xml",
        dataFolderName: projectSlug,
        ticketPrefix: "CHANGE-ME",
      },
      git: {
        dataFolderName: projectSlug,
        repositories: [
          {
            repositoryId: "main-repo",
            url: "https://github.com/CHANGE-ME/CHANGE-ME.git",
          },
        ],
      },
      llm: {
        provider: "github-copilot-cli",
      },
      timeTracking: {
        rawFormat: "teamleader-excel",
        dataFolderName: projectSlug,
      },
    };

    await writeFile(configPath, JSON.stringify(template, null, 2) + "\n", "utf-8");
    console.log(`✓ Template config created at data/${projectSlug}/project-config.json`);
    console.log("");
    console.log("  ⚠ Fill in the placeholder values before running calibration:");
    console.log("    - project.ticketPrefix (e.g. \"PROJ\")");
    console.log("    - jira.ticketPrefix");
    console.log("    - git.repositories[].url");
    console.log("    - Ensure Jira XML export and time-tracking data files are present");
  } else {
    // AC-8.3: Validate existing config
    try {
      const content = await readFile(configPath, "utf-8");
      const config = JSON.parse(content) as Record<string, unknown>;

      const errors: string[] = [];
      if (!config.jira || typeof config.jira !== "object") errors.push("Missing 'jira' section");
      if (!config.git || typeof config.git !== "object") errors.push("Missing 'git' section");
      if (!config.llm || typeof config.llm !== "object") errors.push("Missing 'llm' section");
      if (!config.timeTracking || typeof config.timeTracking !== "object")
        errors.push("Missing 'timeTracking' section");

      if (errors.length > 0) {
        console.error("✗ Config validation errors:");
        for (const err of errors) console.error(`  - ${err}`);
        process.exit(1);
      }

      console.log(`✓ Config validated: data/${projectSlug}/project-config.json`);
    } catch {
      console.error(`✗ Could not parse config at ${configPath}`);
      process.exit(1);
    }
  }

  // AC-8.4: Basic validation checks
  const checks: Array<{ label: string; path: string }> = [];

  // Check for Jira data
  const jiraDir = join(dataDir, "tickets");
  try {
    await access(jiraDir);
    console.log(`✓ Jira data directory found: data/${projectSlug}/tickets/`);
  } catch {
    console.log(`⚠ Jira data directory not found: data/${projectSlug}/tickets/ (create it and add JIRA.xml)`);
  }

  // Check for time-tracking data
  const timeDir = join(dataDir, "time-tracking");
  try {
    await access(timeDir);
    console.log(`✓ Time-tracking data directory found: data/${projectSlug}/time-tracking/`);
  } catch {
    console.log(`⚠ Time-tracking directory not found: data/${projectSlug}/time-tracking/ (create it and add exports)`);
  }

  console.log("\nProject initialisation complete.");

  // AC-7: --warmup flag triggers SQLite data layer warmup
  if (hasFlag(args, "--warmup")) {
    console.log("\n--- Starting data warmup ---\n");

    const configPath = join(dataDir, "project-config.json");
    if (!existsSync(configPath)) {
      console.error(
        "✗ Cannot warmup: project-config.json not found. Run 'isv init --project <slug>' first.",
      );
      process.exit(2);
    }

    let config: Record<string, unknown>;
    try {
      const content = await readFile(configPath, "utf-8");
      config = JSON.parse(content) as Record<string, unknown>;
    } catch {
      console.error(`✗ Could not parse config at ${configPath}`);
      process.exit(2);
    }

    const jiraConfig = config.jira as Record<string, string> | undefined;
    const timeTrackingConfig = config.timeTracking as
      | Record<string, string>
      | undefined;
    const projectConfig = config.project as
      | Record<string, string>
      | undefined;

    if (!jiraConfig?.rawFormat || !jiraConfig?.dataFolderName) {
      console.error(
        "✗ Missing jira.rawFormat or jira.dataFolderName in project config.",
      );
      process.exit(2);
    }

    const ticketPrefix =
      jiraConfig.ticketPrefix ?? projectConfig?.ticketPrefix ?? "UNKNOWN";

    const phaseLabels: Record<WarmupProgressEvent["phase"], string> = {
      "discovering-files": "[1/5] Discovering raw files…",
      "parsing-tickets": "[2/5] Parsing ticket files…",
      "parsing-time-entries": "[3/5] Parsing time-tracking files…",
      "writing-database": "[4/5] Writing SQLite database…",
      complete: "[5/5] Complete",
    };

    try {
      const result = await warmupProjectData({
        projectSlug,
        cwd,
        jiraConfig: {
          rawFormat: jiraConfig.rawFormat,
          dataFolderName: jiraConfig.dataFolderName,
          ticketPrefix,
        },
        timeTrackingConfig: timeTrackingConfig
          ? {
              rawFormat: timeTrackingConfig.rawFormat,
              dataFolderName: timeTrackingConfig.dataFolderName,
              ticketPrefix: timeTrackingConfig.ticketPrefix,
            }
          : undefined,
        onProgress: (event) => {
          const label = phaseLabels[event.phase] ?? event.phase;
          const detail = event.detail ? ` ${event.detail}` : "";
          console.log(`${label}${detail}`);
        },
      });

      console.log(`\n✓ Warmup complete (${result.durationMs}ms)`);
      console.log(`  Tickets:      ${result.ticketCount}`);
      console.log(`  Time entries: ${result.timeEntryCount}`);
      console.log(`  Database:     ${result.dbPath}`);
      console.log(`  Source files: ${result.sourceFiles.length}`);

      if (result.errors.length > 0) {
        console.log(`\n  ⚠ ${result.errors.length} parse warning(s):`);
        for (const err of result.errors) {
          console.log(`    - ${err}`);
        }
      }
    } catch (err) {
      console.error(
        `\n✗ Warmup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(2);
    }
  }
}

// ---------------------------------------------------------------------------
// Calibrate --status command (AC-7.3 / AC-7.4)
// ---------------------------------------------------------------------------

async function runCalibrateStatus(args: string[]): Promise<void> {
  const projectSlug = findFlag(args, "--project");
  if (!projectSlug) {
    console.error("Usage: isv calibrate --status --project <slug> [--run-id <id>]");
    process.exit(1);
  }

  const runId = findFlag(args, "--run-id");
  const cwd = process.cwd();

  // Find store.db files in calibration-runs directory
  const runsDir = resolve(cwd, "data", projectSlug, "calibration-runs");
  if (!existsSync(runsDir)) {
    console.log("No calibration runs found.");
    return;
  }

  // If a specific run-id is given, look for its store.db
  if (runId) {
    const dbPath = join(runsDir, runId, "store.db");
    if (!existsSync(dbPath)) {
      console.log(`No store found for run ${runId}.`);
      return;
    }

    const store = new SqliteRunStore(dbPath);
    try {
      const run = store.getRun(runId);
      if (!run) {
        console.log(`Run ${runId} not found in store.`);
        return;
      }

      console.log(`\nRun: ${run.runId}`);
      console.log(`  Status:    ${run.status}`);
      console.log(`  Project:   ${run.projectSlug}`);
      console.log(`  Created:   ${run.createdAt}`);
      console.log(`  Updated:   ${run.updatedAt}`);
      console.log("");

      // Show cluster-level status
      for (const status of ["pending", "running", "done", "failed", "skipped"] as const) {
        const clusters = store.getClustersByStatus(runId, status);
        if (clusters.length > 0) {
          console.log(`  ${status}: ${clusters.length} cluster(s)`);
          for (const c of clusters) {
            const error = c.error ? ` — ${c.error}` : "";
            console.log(`    - ${c.clusterId} (retries: ${c.retryCount})${error}`);
          }
        }
      }
    } finally {
      store.close();
    }
    return;
  }

  // List all runs (scan directories for store.db)
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runDirs = entries.filter((e) => e.isDirectory());

  if (runDirs.length === 0) {
    console.log("No calibration runs found.");
    return;
  }

  console.log(`\nCalibration runs for project "${projectSlug}":\n`);
  for (const dir of runDirs) {
    const dbPath = join(runsDir, dir.name, "store.db");
    if (!existsSync(dbPath)) {
      console.log(`  ${dir.name}  (no store.db — JSONL-only run)`);
      continue;
    }

    const store = new SqliteRunStore(dbPath);
    try {
      const runs = store.listRuns();
      for (const run of runs) {
        const doneClusters = store.getClustersByStatus(run.runId, "done");
        const failedClusters = store.getClustersByStatus(run.runId, "failed");
        const pendingClusters = store.getClustersByStatus(run.runId, "pending");
        const skippedClusters = store.getClustersByStatus(run.runId, "skipped");
        const total = doneClusters.length + failedClusters.length + pendingClusters.length + skippedClusters.length;

        console.log(`  ${run.runId}`);
        console.log(`    Status: ${run.status}  |  Clusters: ${doneClusters.length} done, ${failedClusters.length} failed, ${skippedClusters.length} skipped, ${pendingClusters.length} pending (${total} total)`);
        console.log(`    Created: ${run.createdAt}`);
      }
    } finally {
      store.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Help texts
// ---------------------------------------------------------------------------

const GENERAL_HELP = `ISV Engine CLI

Usage:
  isv calculate <ticketId> --project <slug> [options]
  isv calibrate --project <slug> [options]
  isv calibrate --status --project <slug> [--run-id <id>]
  isv init --project <slug> [--warmup]
  isv --help

Commands:
  calculate   Calculate the ISV for a single ticket
  calibrate   Run historical calibration for a project
  init        Initialise project structure (--warmup to build SQLite data layer)

Global Options:
  --help      Show help (use with a command for command-specific help)
  --json      Suppress stderr progress output (stdout JSON only)
`;

const CALCULATE_HELP = `isv calculate — Calculate the ISV for a single ticket

Usage:
  isv calculate <ticketId> --project <slug> [options]

Arguments:
  <ticketId>              The ticket ID to calculate ISV for (required)

Options:
  --project <slug>        Project slug (required) — resolves to data/<slug>/project-config.json
  --json                  Suppress stderr progress output (stdout JSON only)
  --help                  Show this help message
`;

const CALIBRATE_HELP = `isv calibrate — Run historical calibration for a project

Usage:
  isv calibrate --project <slug> [options]

Options:
  --project <slug>            Project slug (required) — resolves to data/<slug>/project-config.json
  --from <YYYY-MM>            Start of calibration period (defaults to pipeline default)
  --to <YYYY-MM>              End of calibration period (defaults to pipeline default)
  --run-id <id>               Resume a specific run
  --concurrency <n>           Cluster concurrency (default: 3)
  --llm-concurrency <n>       LLM concurrency (default: 2)
  --status                    Show calibration run status instead of running
  --d3-quality-floor <1|2|3>  D3 quality floor override
  --min-confidence <number>   Minimum cluster confidence to include
  --json                      Suppress stderr progress output (stdout JSON only)
  --help                      Show this help message
`;

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

async function loadProjectConfig(
  projectSlug: string,
): Promise<Record<string, unknown>> {
  const cwd = monorepoRoot();
  const configPath = join(cwd, "data", projectSlug, "project-config.json");
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    console.error(
      `Error: Could not read project config for "${projectSlug}" at ${configPath}`,
    );
    process.exit(2);
  }
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    console.error(
      `Error: Invalid JSON in project config for "${projectSlug}" at ${configPath}`,
    );
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Calculate command
// ---------------------------------------------------------------------------

async function runCalculate(args: string[]): Promise<void> {
  if (hasFlag(args, "--help")) {
    console.error(CALCULATE_HELP);
    process.exit(0);
  }

  const ticketId = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
  const projectSlug = findFlag(args, "--project");
  const jsonOnly = hasFlag(args, "--json");

  if (!ticketId || !projectSlug) {
    console.error(
      "Error: Both <ticketId> and --project <slug> are required.\n",
    );
    console.error(CALCULATE_HELP);
    process.exit(1);
  }

  const cwd = monorepoRoot();
  const projectConfig = await loadProjectConfig(projectSlug);

  // Create pipeline from config
  const factoryResult = await createIsvCalculationFromConfig(projectConfig, {
    cwd,
  });
  if (!factoryResult.success) {
    console.error(JSON.stringify(factoryResult.error, null, 2));
    process.exit(2);
  }

  const { pipeline, cleanup } = factoryResult.data;

  // Extract d3QualityFloor from project config (same as web endpoint)
  const pipelineConfig = projectConfig.pipeline as
    | Record<string, unknown>
    | undefined;
  const rawFloor = pipelineConfig?.d3QualityFloor;
  const d3QualityFloor =
    rawFloor === 1 || rawFloor === 2 || rawFloor === 3 ? rawFloor : undefined;

  // Progress callback — render to stderr
  const onProgress = jsonOnly
    ? undefined
    : (event: PipelineProgressEvent): void => {
        console.error(
          `[step ${event.completedSteps}/${event.totalSteps}] ${event.step}${event.detail ? ` — ${event.detail}` : ""}`,
        );
      };

  try {
    const result = await pipeline.run(ticketId, { d3QualityFloor }, onProgress);

    if (!result.success) {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(2);
    }

    // Persist enriched result to data/<project>/isv/<ticketId>.json
    const isvDir = join(cwd, "data", projectSlug, "isv");
    await mkdir(isvDir, { recursive: true });
    const outPath = join(isvDir, `${ticketId}.json`);
    const jsonPayload = JSON.stringify(result.data, null, 2) + "\n";
    await writeFile(outPath, jsonPayload, "utf-8");

    if (jsonOnly) {
      // --json: emit to stdout for piping
      console.log(jsonPayload.trimEnd());
    } else {
      console.error(`\n✓ ISV = ${result.data.isvResult.isvScore}`);
      console.error(`  Result written to data/${projectSlug}/isv/${ticketId}.json`);
    }
  } finally {
    await cleanup();
  }
}

// ---------------------------------------------------------------------------
// Calibrate command
// ---------------------------------------------------------------------------

async function runCalibrate(args: string[]): Promise<void> {
  // AC-7.3: --status flag
  if (hasFlag(args, "--status")) {
    return runCalibrateStatus(args);
  }

  if (hasFlag(args, "--help")) {
    console.error(CALIBRATE_HELP);
    process.exit(0);
  }

  const projectSlug = findFlag(args, "--project");
  const jsonOnly = hasFlag(args, "--json");

  if (!projectSlug) {
    console.error("Error: --project <slug> is required.\n");
    console.error(CALIBRATE_HELP);
    process.exit(1);
  }

  // AC-8.6: Check that isv init has been run
  const cwd = monorepoRoot();
  const projectDir = resolve(cwd, "data", projectSlug);
  if (!existsSync(projectDir) || !existsSync(join(projectDir, "project-config.json"))) {
    console.error(
      `Error: Project "${projectSlug}" has not been initialised. Run 'isv init --project ${projectSlug}' first.`,
    );
    process.exit(1);
  }

  const projectConfig = await loadProjectConfig(projectSlug);

  // Create pipeline from config
  const factoryResult = await createHistoricalCalibrationFromConfig(
    projectConfig,
    { cwd },
  );
  if (!factoryResult.success) {
    console.error(JSON.stringify(factoryResult.error, null, 2));
    process.exit(2);
  }

  const { pipeline, cleanup } = factoryResult.data;

  // Optional flags
  const periodStart = findFlag(args, "--from");
  const periodEnd = findFlag(args, "--to");
  const runId = findFlag(args, "--run-id");
  const concurrencyStr = findFlag(args, "--concurrency");
  const llmConcurrencyStr = findFlag(args, "--llm-concurrency");
  const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : 3;
  const llmConcurrency = llmConcurrencyStr
    ? parseInt(llmConcurrencyStr, 10)
    : 2;
  const rawD3Floor = findFlag(args, "--d3-quality-floor");
  const d3QualityFloor =
    rawD3Floor === "1" || rawD3Floor === "2" || rawD3Floor === "3"
      ? (Number(rawD3Floor) as 1 | 2 | 3)
      : undefined;
  const rawMinConfidence = findFlag(args, "--min-confidence");
  const minConfidence =
    rawMinConfidence !== undefined ? Number(rawMinConfidence) : undefined;

  // Generate effective run ID
  const effectiveRunId =
    runId ??
    `cal-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${Math.random().toString(36).slice(2, 8)}`;

  // Progress callback — render to stderr
  const onProgress = jsonOnly
    ? undefined
    : (event: CalibrationProgressEvent): void => {
        const prefix =
          event.total > 0 ? `[${event.current}/${event.total}]` : "[-]";
        const cluster = event.clusterId ? ` ${event.clusterId}` : "";
        const status = event.status ? ` — ${event.status}` : "";
        const detail = event.detail ? ` (${event.detail})` : "";
        console.error(
          `${prefix} ${event.phase}${cluster}${status}${detail}`,
        );
      };

  // AC-7.5: SIGINT handler — inform user
  let sigintReceived = false;
  const sigintHandler = () => {
    if (!sigintReceived) {
      sigintReceived = true;
      console.log("\nPausing — waiting for in-flight clusters to complete…");
    }
  };
  process.on("SIGINT", sigintHandler);

  try {
    console.log(`Starting calibration run: ${effectiveRunId}`);
    console.log(`  Concurrency: ${concurrency}  |  LLM Concurrency: ${llmConcurrency}`);
    console.log("");

    const result = await pipeline.run({
      projectSlug,
      periodStart: periodStart ?? undefined,
      periodEnd: periodEnd ?? undefined,
      d3QualityFloor,
      minConfidence,
      runId: effectiveRunId,
      concurrency,
      llmConcurrency,
      onProgress,
    });

    if (!result.success) {
      console.error(`\nCalibration failed: ${result.error.message}`);
      process.exit(sigintReceived ? 130 : 1);
    }

    // Persist report as JSON file under data/<projectSlug>/calibration/
    const reportPath = await writeCalibrationReport(
      result.data,
      projectSlug,
      cwd,
    );
    if (!jsonOnly) {
      console.error(`Report written to ${reportPath}`);
    }

    // Print CalibrationRunOutput to stdout as pretty-printed JSON
    console.log(JSON.stringify(result.data, null, 2));
  } finally {
    process.removeListener("SIGINT", sigintHandler);
    await cleanup();
    if (sigintReceived) {
      process.exit(130);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Strip a leading "--" argument. pnpm/npm uses "--" as a separator between
// the script name and its arguments (e.g. `pnpm cli -- calculate TICKET-1`).
// When the script is invoked via `pnpm cli -- ...`, the "--" ends up in
// process.argv and must be removed before command dispatch.
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const command = args[0];

switch (command) {
  case "calculate": {
    runCalculate(args.slice(1)).catch((err: unknown) => {
      console.error(
        "Unexpected error:",
        err instanceof Error ? err.message : String(err),
      );
      process.exit(2);
    });
    break;
  }

  case "calibrate": {
    runCalibrate(args.slice(1)).catch((err: unknown) => {
      console.error(
        "Unexpected error:",
        err instanceof Error ? err.message : String(err),
      );
      process.exit(2);
    });
    break;
  }

  case "init": {
    runInit(args.slice(1)).catch((err) => {
      console.error("Unexpected error:", err);
      process.exit(1);
    });
    break;
  }

  case "--help":
  case undefined: {
    console.error(GENERAL_HELP);
    break;
  }

  default: {
    console.error(`Unknown command: ${command}\n`);
    console.error(GENERAL_HELP);
    process.exit(1);
  }
}
