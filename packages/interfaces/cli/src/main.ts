#!/usr/bin/env node

/**
 * ISV Engine CLI — entry point.
 *
 * Usage:
 *   isv calculate <ticketId>  — Calculate ISV for a single ticket
 *   isv calibrate --project <slug> [--from <YYYY-MM>] [--to <YYYY-MM>] [--run-id <id>]
 *                 [--concurrency <n>] [--llm-concurrency <n>]
 *   isv calibrate --status --project <slug> [--run-id <id>]
 *   isv init --project <slug>
 */

import { readFile, mkdir, writeFile, stat, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import type { CalibrationProgressEvent } from "@isv/pipelines";
import {
  createHistoricalCalibrationFromConfig,
  SqliteRunStore,
} from "@isv/pipelines";

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
// Calibrate command
// ---------------------------------------------------------------------------

async function runCalibrate(args: string[]): Promise<void> {
  // AC-7.3: --status flag
  if (hasFlag(args, "--status")) {
    return runCalibrateStatus(args);
  }

  const projectSlug = findFlag(args, "--project");
  if (!projectSlug) {
    console.error(
      "Usage: isv calibrate --project <slug> [--from <YYYY-MM>] [--to <YYYY-MM>] [--run-id <id>] [--concurrency <n>] [--llm-concurrency <n>]",
    );
    process.exit(1);
  }

  // AC-8.6: Check that isv init has been run
  const cwd = process.cwd();
  const projectDir = resolve(cwd, "data", projectSlug);
  if (!existsSync(projectDir) || !existsSync(join(projectDir, "project-config.json"))) {
    console.error(
      `Error: Project "${projectSlug}" has not been initialised. Run 'isv init --project ${projectSlug}' first.`,
    );
    process.exit(1);
  }

  const periodStart = findFlag(args, "--from");
  const periodEnd = findFlag(args, "--to");
  const runId = findFlag(args, "--run-id");
  const concurrencyStr = findFlag(args, "--concurrency");
  const llmConcurrencyStr = findFlag(args, "--llm-concurrency");

  const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : 3;
  const llmConcurrency = llmConcurrencyStr
    ? parseInt(llmConcurrencyStr, 10)
    : 2;

  // Load project config
  const configPath = resolve(cwd, "data", projectSlug, "project-config.json");
  let rawConfig: Record<string, unknown>;
  try {
    const content = await readFile(configPath, "utf-8");
    rawConfig = JSON.parse(content);
  } catch {
    console.error(`Error: Could not read project config at ${configPath}`);
    process.exit(1);
  }

  // Create pipeline from config
  const factoryResult = await createHistoricalCalibrationFromConfig(rawConfig, {
    cwd,
  });
  if (!factoryResult.success) {
    console.error(`Error: ${factoryResult.error.message}`);
    process.exit(1);
  }

  const { pipeline, cleanup } = factoryResult.data;

  // Progress callback — render to stdout
  const onProgress = (event: CalibrationProgressEvent): void => {
    const prefix =
      event.total > 0 ? `[${event.current}/${event.total}]` : "[-]";
    const cluster = event.clusterId ? ` ${event.clusterId}` : "";
    const status = event.status ? ` — ${event.status}` : "";
    const detail = event.detail ? ` (${event.detail})` : "";
    console.log(`${prefix} ${event.phase}${cluster}${status}${detail}`);
  };

  // Generate effective run ID
  const effectiveRunId =
    runId ??
    `cal-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${Math.random().toString(36).slice(2, 8)}`;

  // Create RunStore for this run
  const storePath = join(
    cwd,
    "data",
    projectSlug,
    "calibration-runs",
    effectiveRunId,
    "store.db",
  );

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
      periodStart,
      periodEnd,
      runId: effectiveRunId,
      concurrency,
      llmConcurrency,
      onProgress,
    });

    if (!result.success) {
      console.error(`\nCalibration failed: ${result.error.message}`);
      process.exit(sigintReceived ? 130 : 1);
    }

    // Write result JSON
    const resultDir = join(
      cwd,
      "data",
      projectSlug,
      "calibration-runs",
      effectiveRunId,
    );
    await mkdir(resultDir, { recursive: true });
    const resultPath = join(resultDir, "result.json");
    await writeFile(resultPath, JSON.stringify(result.data, null, 2), "utf-8");

    // Print summary
    const { clusters, skippedClusters } = result.data;
    console.log("\n--- Calibration Complete ---");
    console.log(`Total clusters: ${clusters.length + skippedClusters.length}`);
    console.log(`Successful:     ${clusters.length}`);
    console.log(`Skipped:        ${skippedClusters.length}`);
    if (skippedClusters.length > 0) {
      console.log(
        `Skipped IDs:    ${skippedClusters.map((s) => s.clusterId).join(", ")}`,
      );
    }
    console.log(
      `Ship Rate:      ${result.data.result.shipRateHoursPerIsv.toFixed(2)} hrs/ISV`,
    );
    console.log(`R²:             ${result.data.result.rSquared.toFixed(4)}`);
    console.log(`Result file:    ${resultPath}`);
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

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "calculate": {
    const ticketId = args[1];
    if (!ticketId) {
      console.error("Usage: isv calculate <ticketId>");
      process.exit(1);
    }
    console.log(`ISV calculation for ticket: ${ticketId}`);
    console.log(
      "Note: Full CLI integration requires configured client adapters (Git, Jira, LLM).",
    );
    console.log(
      "See packages/interfaces/cli/README.md for configuration instructions.",
    );
    break;
  }

  case "calibrate": {
    runCalibrate(args.slice(1)).catch((err) => {
      console.error("Unexpected error:", err);
      process.exit(1);
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

  default:
    console.log("ISV Engine CLI v0.0.1");
    console.log("");
    console.log("Commands:");
    console.log(
      "  isv calculate <ticketId>             Calculate ISV for a single ticket",
    );
    console.log(
      "  isv calibrate --project <slug>       Run historical calibration",
    );
    console.log(
      "  isv calibrate --status --project <slug>  Show calibration run status",
    );
    console.log(
      "  isv init --project <slug>            Initialise project structure",
    );
    console.log("");
    console.log("Calibrate options:");
    console.log("  --from <YYYY-MM>                     Period start");
    console.log("  --to <YYYY-MM>                       Period end");
    console.log("  --run-id <id>                        Resume a specific run");
    console.log("  --concurrency <n>                    Cluster concurrency (default: 3)");
    console.log("  --llm-concurrency <n>                LLM concurrency (default: 2)");
    console.log("");
    console.log("Options:");
    console.log("  --help                               Show this help message");
    break;
}
