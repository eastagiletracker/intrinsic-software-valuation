# ISV CLI

## Purpose

Command-line interface for the ISV Engine. Exposes both use cases:
1. `isv calculate <ticketId>` — Single-ticket ISV calculation (Use Case 2)
2. `isv calibrate` — Historical calibration batch run (Use Case 1)

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
isv calibrate
```

## Configuration

The CLI requires the following client adapters to be configured:
- **Git** — repository access for code checkout
- **Jira** — ticket data in XML export format
- **LLM** — GitHub Copilot CLI or compatible provider
- **Time-Tracking** — time entries in supported format (for calibration)

Configuration is loaded from project-specific config files. See the main README for details.
