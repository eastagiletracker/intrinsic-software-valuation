# Interfaces

Delivery mechanisms that expose pipelines to the outside world.

## Purpose

Each subdirectory in this folder is a separate pnpm workspace package that provides a user-facing entry point to the ISV Engine.

## Implemented Interfaces

- `cli/` — `@isv/cli` — command-line entry points for ISV calculation and historical calibration
- `web/` — `@isv/web` — web-based dashboard for interactive ISV calculation and calibration review

## Planned Interfaces

- `api/` — REST API and/or MCP server for webhook-triggered or agent-invoked ISV runs

## Usage

```bash
# CLI: Single-ticket ISV calculation
isv calculate PROJ-123

# CLI: Historical calibration batch run
isv calibrate

# Web UI: Start the development server
cd packages/interfaces/web && pnpm run dev
```
