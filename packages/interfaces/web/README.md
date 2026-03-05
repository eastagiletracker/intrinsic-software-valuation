# ISV Web UI

Web-based dashboard for running ISV calculations, inspecting intermediate results, and reviewing calibration data per project.

## Purpose

Provides an interactive three-panel web interface to the ISV Engine:

- **Left sidebar** — Project selector listing all configured projects from `data/`
- **Center panel** — ISV Calculator with ticket input, pipeline step results, and final ISV score
- **Right panel** — Calibration context showing story points, tracked hours, Git change metrics, and plausibility assessment

## Contents

| Path | Description |
| --- | --- |
| `src/routes/+page.svelte` | Main three-panel layout page |
| `src/routes/+layout.svelte` | Root layout with global CSS |
| `src/routes/api/projects/` | Server route: list available projects from `data/` |
| `src/routes/api/calculate/` | Server route: trigger ISV calculation pipeline |
| `src/routes/reports/[project]/` | Report index: list saved calibration reports per project |
| `src/routes/reports/[project]/[report]/` | Report detail: render a single calibration report |
| `src/lib/components/` | Svelte UI components (Sidebar, TicketInput, Card, Charts, Tooltip, etc.) |
| `src/lib/server/` | Server-side utilities (project scanning, report reading) |
| `src/lib/types/` | Shared TypeScript types for API layer |
| `src/app.css` | Global styles: Tailwind CSS + Bitgrip CI theme |
| `static/` | Static assets: logo, favicon, fonts |

## How to use

```bash
# From the monorepo root
cd packages/interfaces/web
pnpm install
pnpm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

### Prerequisites

- A `data/<project>/project-config.json` file for at least one project
- Node.js 24+ and pnpm (workspace setup)

### Project configuration

Projects are discovered by scanning `data/*/project-config.json`. Each config must have:

```json
{
  "project": {
    "name": "My Project",
    "ticketPrefix": "PROJ"
  }
}
```

## Tech stack

- **Framework**: SvelteKit (Svelte 5)
- **Styling**: Tailwind CSS 4 with Bitgrip CI theme
- **Charting**: layerchart (Svelte chart components based on LayerCake + D3)
- **Fonts**: Roboto Flex Variable (bundled locally)
- **Integration**: Server routes import from `@isv/pipelines` and `@isv/domain`

## Architecture

The web UI follows the repository dependency rule:

```
@isv/web → @isv/pipelines → @isv/services → @isv/clients
                ↓
           @isv/domain
```

The UI (interface layer) depends on `@isv/pipelines` and `@isv/domain` only. It never imports from `@isv/services` or `@isv/clients` directly.

## Constraints

- **Read-only**: No write-back to any external system
- **Local-only**: Runs exclusively on `localhost` via `pnpm dev`
- **No authentication**: Designed for single-user local development use

## API Endpoints

### `GET /api/projects`

Returns the list of available projects discovered from `data/*/project-config.json`.

### `POST /api/calculate`

Runs the full ISV calculation pipeline for a single ticket. The endpoint reads the
project configuration, instantiates all required clients and services via the
config-based pipeline factory from `@isv/pipelines`, and returns the enriched result.

**Request body:**

```json
{ "ticketId": "PROJ-123", "projectSlug": "my-project" }
```

**Success response:**

```json
{
  "success": true,
  "data": {
    "ticket": { "ticketId": "", "type": "", "title": "", "description": "", "labels": [], "comments": [] },
    "pipelineResults": {
      "repositories": [{ "repositoryId": "", "codeHealthReport": {}, "systemContext": {}, "c2State": 1, "provenance": {} }],
      "effectiveC2": 1,
      "gapAnalysis": {}
    },
    "isvResult": { "formulaVersion": "", "ticketId": "", "factors": {}, "breakdown": {}, "isvScore": 0 },
    "calibration": { "storyPoints": 0 }
  }
}
```

**Error response:**

```json
{ "success": false, "error": { "code": "PIPELINE_FAILED", "message": "...", "source": "..." } }
```

**Required project config sections:** `jira`, `git`, `llm` — see `packages/pipelines/src/isv-calculation/README.md` for details.

### Calibration Report Routes

#### `GET /reports/[project]`

Lists all saved calibration report files for a project from `data/<project>/calibration/`.
Each entry includes period, sample size, R², and fit assessment badge.

#### `GET /reports/[project]/[report]`

Renders a single calibration report with sections:

- **Executive Summary** — Ship Rate in € per ISV (using legacy daily rate), R², DQS, sample size
- **Cluster Scatter Plot** — ISV-derived comparison value vs. actual tracked hours (layerchart)
- **Residual Distribution** — Predicted hours vs. residuals (layerchart)
- **Factor Diagnostics** — Per-factor partial correlations, weights, p-values
- **Outlier Report** — Flagged clusters with reasons
- **Data Quality & Reliability** — DQS, confidence interval, normality assessment
- **Recommendations** — Formula validation, factor ranking, mismatches

Includes optional term explanations via hover tooltips and a global show/hide toggle.
The legacy daily rate is read from `project-config.json` → `project.legacyDailyRate` (default: 1,000 €/day for 8 h) and displayed at the top of each report.

Reports are read-only — the UI never modifies saved JSON files.
