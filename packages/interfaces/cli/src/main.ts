#!/usr/bin/env node

/**
 * ISV Engine CLI — entry point.
 *
 * Commands:
 *   isv calculate <ticketId> --project <slug>  — Calculate ISV for a single ticket
 *   isv calibrate --project <slug>             — Run historical calibration
 *   isv --help                                 — Show usage information
 *
 * Exit codes:
 *   0 — success
 *   1 — user error (missing arguments, bad usage)
 *   2 — pipeline / runtime error
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  PipelineProgressEvent,
  CalibrationProgressEvent,
} from "@isv/pipelines";
import {
  createIsvCalculationFromConfig,
  createHistoricalCalibrationFromConfig,
  writeCalibrationReport,
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
// Help texts
// ---------------------------------------------------------------------------

const GENERAL_HELP = `ISV Engine CLI

Usage:
  isv calculate <ticketId> --project <slug> [options]
  isv calibrate --project <slug> [options]
  isv --help

Commands:
  calculate   Calculate the ISV for a single ticket
  calibrate   Run historical calibration for a project

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
  --period-start <YYYY-MM>    Start of calibration period (defaults to pipeline default)
  --period-end <YYYY-MM>      End of calibration period (defaults to pipeline default)
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

    // Print enriched result to stdout as pretty-printed JSON
    console.log(JSON.stringify(result.data, null, 2));
  } finally {
    await cleanup();
  }
}

// ---------------------------------------------------------------------------
// Calibrate command
// ---------------------------------------------------------------------------

async function runCalibrate(args: string[]): Promise<void> {
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

  const cwd = monorepoRoot();
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
  const periodStart = findFlag(args, "--period-start");
  const periodEnd = findFlag(args, "--period-end");
  const rawD3Floor = findFlag(args, "--d3-quality-floor");
  const d3QualityFloor =
    rawD3Floor === "1" || rawD3Floor === "2" || rawD3Floor === "3"
      ? (Number(rawD3Floor) as 1 | 2 | 3)
      : undefined;
  const rawMinConfidence = findFlag(args, "--min-confidence");
  const minConfidence =
    rawMinConfidence !== undefined ? Number(rawMinConfidence) : undefined;

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

  try {
    const result = await pipeline.run({
      projectSlug,
      periodStart: periodStart ?? undefined,
      periodEnd: periodEnd ?? undefined,
      d3QualityFloor,
      minConfidence,
      onProgress,
    });

    if (!result.success) {
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(2);
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
    await cleanup();
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
