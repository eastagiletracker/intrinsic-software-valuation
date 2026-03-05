# ISV CLI

## Purpose

Command-line interface for the ISV Engine. Exposes both use cases:
1. `isv calculate <ticketId> --project <slug>` — Single-ticket ISV calculation (Use Case 2)
2. `isv calibrate --project <slug>` — Historical calibration batch run (Use Case 1)
3. `isv init --project <slug>` — Project initialisation and validation

## Contents

| File | Description |
| --- | --- |
| `src/main.ts` | CLI entry point with command routing |
| `package.json` | Package configuration |
| `tsconfig.json` | TypeScript project references |

## How to use

All commands are run from the monorepo root via `pnpm cli -- <command>`.
The `--` separator is required so pnpm forwards the flags to the CLI.

```bash
# Show general help
pnpm cli -- --help

# Initialise a new project
pnpm cli -- init --project my-project

# Calculate ISV for a single ticket
pnpm cli -- calculate PROJ-123 --project my-project

# Calculate with JSON-only output (suppress progress)
pnpm cli -- calculate PROJ-123 --project my-project --json

# Run historical calibration
pnpm cli -- calibrate --project my-project

# Calibrate with optional period, resume, and concurrency
pnpm cli -- calibrate --project my-project --from 2025-01 --to 2026-02 --run-id my-run --concurrency 5 --llm-concurrency 3

# Calibrate with quality floor override
pnpm cli -- calibrate --project my-project --d3-quality-floor 2

# Check calibration run status
pnpm cli -- calibrate --status --project my-project
pnpm cli -- calibrate --status --project my-project --run-id my-run

# Command-specific help
pnpm cli -- calculate --help
pnpm cli -- calibrate --help
```

### Init options

| Flag | Description |
| --- | --- |
| `--project <slug>` | **(required)** Project slug for directory structure |

### Calculate options

| Flag | Description |
| --- | --- |
| `--project <slug>` | **(required)** Project slug — resolves to `data/<slug>/project-config.json` |
| `--json` | Suppress stderr progress output (stdout JSON only) |
| `--help` | Show command-specific help |

### Calibrate options

| Flag | Description |
| --- | --- |
| `--project <slug>` | **(required)** Project slug — resolves to `data/<slug>/project-config.json` |
| `--from <YYYY-MM>` | Start of calibration period (defaults to 18 months before end) |
| `--to <YYYY-MM>` | End of calibration period (defaults to current month) |
| `--run-id <id>` | Checkpoint run ID for resume (defaults to timestamp-based ID) |
| `--concurrency <n>` | Maximum concurrent cluster workers (default: 3) |
| `--llm-concurrency <n>` | Maximum concurrent LLM API calls (default: 2) |
| `--status` | Show run status instead of running calibration |

### Calibration output

- Progress events are printed to stdout as they occur
- On completion, a summary is printed with total/successful/skipped cluster counts
- The full `CalibrationRunOutput` is written as JSON to `data/<slug>/calibration-runs/<runId>/result.json`
- A JSONL checkpoint file at `data/<slug>/calibration-runs/<runId>/progress.jsonl` enables crash recovery
- A SQLite database at `data/<slug>/calibration-runs/<runId>/store.db` stores run/cluster state

### SIGINT handling

Pressing Ctrl+C during calibration pauses the queue, waits for in-flight clusters to complete,
persists state to the RunStore, and exits cleanly with code 130.

### Additional calibrate flags

| Flag | Description |
| --- | --- |
| `--d3-quality-floor <1\|2\|3>` | D3 quality floor override |
| `--min-confidence <number>` | Minimum cluster confidence to include |
| `--json` | Suppress stderr progress output (stdout JSON only) |
| `--help` | Show command-specific help |

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | User error (missing arguments, bad usage) |
| 2 | Pipeline / runtime error (config load failure, pipeline error) |
| 130 | Interrupted by SIGINT (Ctrl+C) during calibration |

### Output

- Progress events are printed to stderr as they occur
- On success, the full result is printed to stdout as pretty-printed JSON (2-space indent)
- On pipeline error, the error object is printed to stderr as JSON
- Use `--json` to suppress stderr progress for scripted consumption (e.g. `pnpm cli -- calculate PROJ-123 --project my-project --json | jq .isvResult`)

## Configuration

The CLI requires a valid `data/<slug>/project-config.json`. Required sections:

- **jira** — ticket data configuration (dataFolderName, ticketPrefix, rawFormat)
- **git** — repository access configuration (repositories, dataFolderName)
- **llm** — LLM provider configuration (provider, timeoutMs)

The `calibrate` command additionally requires:

- **timeTracking** — time entries configuration (dataFolderName, rawFormat)

Use `pnpm cli -- init --project <slug>` to create a template config with placeholder values.
See the main README for details.
