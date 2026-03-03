# Interfaces

Delivery mechanisms that expose pipelines to the outside world.

## Purpose

Each subdirectory in this folder will become a separate pnpm workspace package when implemented (e.g. `@isv/cli`, `@isv/api`).

## Planned Interfaces

- `cli/` — command-line entry points for both ISV calculation and historical calibration
- `api/` — REST API and/or MCP server for webhook-triggered or agent-invoked ISV runs

## Status

Not yet implemented. Will be added as separate workspace packages when needed.
