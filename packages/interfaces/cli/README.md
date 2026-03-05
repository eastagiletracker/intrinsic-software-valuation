# ISV CLI

## Purpose

Command-line interface for the ISV Engine. Exposes both use cases:
1. `isv calculate <ticketId>` — Single-ticket ISV calculation (Use Case 2)
2. `isv calibrate --project <slug>` — Historical calibration batch run (Use Case 1)

## Contents

| File | Description |
| --- | --- |
| `src/main.ts` | CLI entry point with command routing |
| `package.json` | Package configuration |
| `tsconfig.json` | TypeScript project references |

## How to use

```bash
# Calculate ISV for a single ticket
isv calculate PROJ-123

# Run historical calibration
isv calibrate --project my-project

# With optional period and resume support
isv calibrate --project my-project --from 2025-01 --to 2026-02 --run-id my-run
```

### Calibrate options

| Flag | Description |
| --- | --- |
| `--project <slug>` | **(required)** Project slug — resolves to `data/<slug>/project-config.json` |
| `--from <YYYY-MM>` | Start of calibration period (defaults to 18 months before end) |
| `--to <YYYY-MM>` | End of calibration period (defaults to current month) |
| `--run-id <id>` | Checkpoint run ID for resume (defaults to timestamp-based ID) |

### Output

- Progress events are printed to stdout as they occur
- On completion, a summary is printed with total/successful/skipped cluster counts
- The full `CalibrationRunOutput` is written as JSON to `data/<slug>/calibration-runs/<runId>/result.json`
- A JSONL checkpoint file at `data/<slug>/calibration-runs/<runId>/progress.jsonl` enables crash recovery

## Configuration

The CLI requires the following sections in `data/<slug>/project-config.json`:
- **jira** — ticket data configuration (dataFolderName, ticketPrefix, rawFormat)
- **git** — repository access configuration (repositories, dataFolderName)
- **llm** — LLM provider configuration (provider, timeoutMs)
- **timeTracking** — time entries configuration (dataFolderName, rawFormat)

See the main README for details.
