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
| `src/lib/components/` | Svelte UI components (Sidebar, TicketInput, Card, etc.) |
| `src/lib/server/` | Server-side utilities (project scanning) |
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
