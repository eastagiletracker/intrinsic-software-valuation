# CLI Implementation Requirements

## User Story

As a **Developer / ISV Analyst**, I want **to run ISV calculations and historical calibrations from the command line** so that I can **evaluate tickets and calibrate the model without starting the web server, and integrate ISV into scripts and CI pipelines**.

---

## Scope

### In scope

- Wire the existing CLI stub (`packages/interfaces/cli/src/main.ts`) to actually execute the ISV Calculation Pipeline and Historical Calibration Pipeline
- Load project configuration from `data/<projectSlug>/project-config.json`
- Accept required arguments (ticket ID, project slug) and optional flags (period, quality floor)
- Print structured JSON output to stdout for machine consumption
- Print human-readable progress to stderr so pipeline steps are visible during long runs
- Exit with appropriate codes (0 = success, 1 = user error, 2 = pipeline error)
- A root-level npm script to invoke the CLI conveniently (e.g. `pnpm cli`)

### Out of scope

- SSE or streaming output format (terminal progress via stderr is sufficient)
- Interactive prompts or TUI (the CLI is non-interactive, arguments only)
- Persisting results to disk (consumer can redirect stdout)
- Adding external CLI framework dependencies (yargs, commander, etc.) — use manual arg parsing to stay minimal
- Deployment or packaging as a standalone binary
- Calibration config factory (calibration pipeline is wired directly; a config factory can be added later)

---

## Commands & Acceptance Criteria

### Command 1 — `isv calculate <ticketId> --project <slug>`

Calculate the ISV for a single ticket.

- [ ] **AC-1.1** The command requires a positional `<ticketId>` argument and a `--project <slug>` flag; if either is missing, print usage to stderr and exit with code 1
- [ ] **AC-1.2** The CLI loads `data/<slug>/project-config.json` by resolving the path relative to the monorepo root (same resolution strategy as the web endpoint); if the file is missing or contains invalid JSON, print a descriptive error to stderr and exit with code 2
- [ ] **AC-1.3** The CLI calls `createIsvCalculationFromConfig(projectConfig, { cwd })` to construct the pipeline, passing `cwd` as the monorepo root so data paths resolve correctly
- [ ] **AC-1.4** The CLI calls `pipeline.run(ticketId, { d3QualityFloor }, onProgress)` where `d3QualityFloor` is read from `projectConfig.pipeline.d3QualityFloor` (same as web endpoint)
- [ ] **AC-1.5** The `onProgress` callback prints each `PipelineProgressEvent` as a single line to stderr in the format `[step N/M] <stepId> — <detail>` so the user sees progress during long runs
- [ ] **AC-1.6** On success, the full `EnrichedIsvResult` is printed to stdout as pretty-printed JSON (2-space indent)
- [ ] **AC-1.7** On pipeline error (`Result.success === false`), the error object is printed to stderr as JSON and the process exits with code 2
- [ ] **AC-1.8** The `cleanup()` function (Git worktree release) is called in a `finally` block regardless of outcome
- [ ] **AC-1.9** An optional `--json` flag suppresses stderr progress output (only stdout JSON), useful for scripted consumption

### Command 2 — `isv calibrate --project <slug>`

Run the Historical Calibration Pipeline for a project.

- [ ] **AC-2.1** The command requires `--project <slug>`; if missing, print usage to stderr and exit with code 1
- [ ] **AC-2.2** The CLI loads and validates `data/<slug>/project-config.json` (same as calculate command)
- [ ] **AC-2.3** Optional flags: `--period-start <YYYY-MM>`, `--period-end <YYYY-MM>`, `--d3-quality-floor <1|2|3>`, `--min-confidence <number>`; defaults are provided by the pipeline itself when omitted
- [ ] **AC-2.4** The CLI constructs the Historical Calibration Pipeline with all required client and service dependencies injected (matching the existing pipeline factory pattern)
- [ ] **AC-2.5** The CLI calls `pipeline.run(config)` with the assembled `HistoricalCalibrationConfig`
- [ ] **AC-2.6** On success, the full `CalibrationRunOutput` is printed to stdout as pretty-printed JSON
- [ ] **AC-2.7** On pipeline error, the error object is printed to stderr as JSON and the process exits with code 2
- [ ] **AC-2.8** Resource cleanup is performed in a `finally` block

### Command 3 — `isv --help`

- [ ] **AC-3.1** Prints usage information listing both commands, their arguments, and available flags
- [ ] **AC-3.2** Each command also supports `--help` (e.g. `isv calculate --help`) showing command-specific usage

### Root-level convenience

- [ ] **AC-4.1** A `cli` script in the root `package.json` allows running `pnpm cli -- calculate UNICEF-18894 --project unicef` from the monorepo root
- [ ] **AC-4.2** The script uses `tsx` to execute the CLI entry point directly (no build step required)

---

## Edge Cases & Constraints

- **cwd resolution**: The CLI must resolve the monorepo root correctly regardless of which directory it is invoked from. Use `import.meta.dirname` or similar to anchor to the CLI package, then navigate up to the monorepo root (3 levels: `cli/src/` → `cli/` → `interfaces/` → `packages/` → root). This mirrors the web endpoint's `join(process.cwd(), "..", "..", "..")` approach but must not rely on `process.cwd()` being the monorepo root.
- **Missing project config**: Must produce a clear error (project slug, expected path) — not a stack trace.
- **LLM timeout**: The LLM client may time out during architecture scanning. The pipeline already handles this as a `Result` error; the CLI should surface the pipeline error, not crash.
- **Large output**: `CalibrationRunOutput` can be large (many clusters). Stdout JSON is still the right default; consumers can pipe through `jq` for filtering.
- **No calibration config factory**: Unlike `isv-calculation`, the `historical-calibration` pipeline has no `createFromConfig` helper. The CLI must wire clients and services manually. This is acceptable for now; a config factory can be extracted later if needed.

---

## Relevant Context

- [packages/interfaces/cli/src/main.ts](packages/interfaces/cli/src/main.ts) — Current CLI stub (to be replaced)
- [packages/interfaces/cli/package.json](packages/interfaces/cli/package.json) — CLI package with workspace dependencies already declared
- [packages/interfaces/cli/README.md](packages/interfaces/cli/README.md) — CLI README (update after implementation)
- [packages/pipelines/src/isv-calculation/config-factory.ts](packages/pipelines/src/isv-calculation/config-factory.ts) — Config factory used by the web endpoint; the CLI should reuse this
- [packages/pipelines/src/isv-calculation/port.ts](packages/pipelines/src/isv-calculation/port.ts) — Pipeline port with `run()` signature and progress callback types
- [packages/pipelines/src/historical-calibration/port.ts](packages/pipelines/src/historical-calibration/port.ts) — Calibration pipeline port and `HistoricalCalibrationConfig`
- [packages/interfaces/web/src/routes/api/calculate/+server.ts](packages/interfaces/web/src/routes/api/calculate/+server.ts) — Web endpoint as reference implementation for config loading, cwd resolution, and pipeline invocation
- [data/unicef/project-config.json](data/unicef/project-config.json) — Example project config structure

## Open Questions

- Should the CLI support a `--verbose` flag for debug-level logging from client adapters (Git clone progress, LLM token usage)? Current pipeline does not expose this, so it would require adapter changes. Recommend deferring.
- @Architect — The calibration pipeline has no config factory. Should one be extracted as part of this task, or accept the manual wiring for now and extract later?
