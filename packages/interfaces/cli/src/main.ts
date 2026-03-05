#!/usr/bin/env node

/**
 * ISV Engine CLI — entry point.
 *
 * Usage:
 *   isv calculate <ticketId>  — Calculate ISV for a single ticket
 *   isv calibrate --project <slug> [--from <YYYY-MM>] [--to <YYYY-MM>] [--run-id <id>]
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { CalibrationProgressEvent } from "@isv/pipelines";
import { createHistoricalCalibrationFromConfig } from "@isv/pipelines";

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

function findFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

// ---------------------------------------------------------------------------
// Calibrate command
// ---------------------------------------------------------------------------

async function runCalibrate(args: string[]): Promise<void> {
  const projectSlug = findFlag(args, "--project");
  if (!projectSlug) {
    console.error("Usage: isv calibrate --project <slug> [--from <YYYY-MM>] [--to <YYYY-MM>] [--run-id <id>]");
    process.exit(1);
  }

  const periodStart = findFlag(args, "--from");
  const periodEnd = findFlag(args, "--to");
  const runId = findFlag(args, "--run-id");

  // Load project config
  const cwd = process.cwd();
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

  try {
    const effectiveRunId =
      runId ??
      `cal-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

    const result = await pipeline.run({
      projectSlug,
      periodStart,
      periodEnd,
      runId: effectiveRunId,
      onProgress,
    });

    if (!result.success) {
      console.error(`\nCalibration failed: ${result.error.message}`);
      process.exit(1);
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
    await cleanup();
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

  default:
    console.log("ISV Engine CLI v0.0.1");
    console.log("");
    console.log("Commands:");
    console.log(
      "  isv calculate <ticketId>  Calculate ISV for a single ticket",
    );
    console.log(
      "  isv calibrate --project <slug>  Run historical calibration",
    );
    console.log("");
    console.log("Options:");
    console.log("  --help                    Show this help message");
    break;
}
