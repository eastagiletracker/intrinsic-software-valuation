# ISV CLI

## Purpose

Command-line interface for the ISV Engine. Exposes both use cases:
1. `isv calculate <ticketId>` — Single-ticket ISV calculation (Use Case 2)
2. `isv calibrate --project <slug>` — Historical calibration batch run (Use Case 1)
3. `isv init --project <slug>` — Project initialisation and validation

## Contents

| File | Description |
| --- | --- |
| `src/main.ts` | CLI entry point with command routing |
| `package.json` | Package configuration |
| `tsconfig.json` | TypeScript project references |

## How to use

```bash
# Initialise a new project
isv init --project my-project

# Calculate ISV for a single ticket
isv calculate PROJ-123

# Run historical calibration (concurrent)
isv calibrate --project my-project

# With optional period, resume, and concurrency
isv calibrate --project my-project --from 2025-01 --to 2026-02 --run-id my-run --concurrency 5 --llm-concurrency 3

# Check calibration run status
isv calibrate --status --project my-project
isv calibrate --status --project my-project --run-id my-run
```

### Init options

| Flag | Description |
| --- | --- |
| `--project <slug>` | **(required)** Project slug for directory structure |

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

### Output

- Progress events are printed to stdout as they occur
- On completion, a summary is printed with total/successful/skipped cluster counts
- The full `CalibrationRunOutput` is written as JSON to `data/<slug>/calibration-runs/<runId>/result.json`
- A JSONL checkpoint file at `data/<slug>/calibration-runs/<runId>/progress.jsonl` enables crash recovery
- A SQLite database at `data/<slug>/calibration-runs/<runId>/store.db` stores run/cluster state

### SIGINT handling

Pressing Ctrl+C during calibration pauses the queue, waits for in-flight clusters to complete,
persists state to the RunStore, and exits cleanly with code 130.

## Configuration

The CLI requires the following sections in `data/<slug>/project-config.json`:
- **jira** — ticket data configuration (dataFolderName, ticketPrefix, rawFormat)
- **git** — repository access configuration (repositories, dataFolderName)
- **llm** — LLM provider configuration (provider, timeoutMs)
- **timeTracking** — time entries configuration (dataFolderName, rawFormat)

Use `isv init --project <slug>` to create a template config with placeholder values.
See the main README for details.
