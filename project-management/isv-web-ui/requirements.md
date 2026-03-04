# ISV Web UI Requirements

## User Story

As a **Technical Product Owner / ISV Analyst**, I want **a web-based dashboard to run ISV calculations, inspect intermediate results, and review calibration data per project** so that I can **evaluate individual tickets interactively and assess the plausibility of ISV scores against historical effort data — without relying on the CLI**.

---

## Scope

### In scope

- A three-panel web application (project selector, ISV calculator, calibration panel)
- Dynamic project/client listing derived from `data/` folder contents
- Single-ticket ISV calculation via the existing `IsvCalculationPipeline`
- Display of all intermediate pipeline results (Status Quo Miner, Architecture Scanner, Gap Analyzer)
- Display of the final ISV score with formula breakdown
- Calibration context panel showing story points, hours, code changes, and plausibility summary
- SvelteKit + Tailwind CSS tech stack, integrated as a new package in the monorepo
- Read-only interaction with the existing backend pipelines (no write-back to Jira)

### Out of scope

- Batch calibration execution from the UI (Historical Calibration Pipeline remains CLI-only for now)
- Editing or modifying tickets, time tracking, or project configuration from the UI
- User authentication and multi-tenancy
- Persistent storage of ISV results beyond the current session
- Deployment, hosting, or containerization — the app runs locally only (`localhost`)
- Write-back of ISV scores to Jira or other ticket systems
- Real-time collaboration or multi-user features

---

## Panels & Acceptance Criteria

### Panel 1 — Project Selector (Left Sidebar)

The left sidebar acts as the application-level navigation. It lists all available projects and allows the user to select one as the active context.

- [ ] **AC-1.1** The sidebar lists all projects derived from subdirectories of `data/` that contain a valid `project-config.json`
- [ ] **AC-1.2** Each list entry displays the project name from `project-config.json → project.name` (e.g. "UNICEF Deutschland")
- [ ] **AC-1.3** Clicking a project entry selects it as the active project; the active entry is visually highlighted (distinct background or accent color)
- [ ] **AC-1.4** Only one project can be active at a time
- [ ] **AC-1.5** Selecting a different project resets the middle and right panel to their initial/empty state
- [ ] **AC-1.6** If no projects exist in `data/`, the sidebar shows an informational empty state (e.g. "No projects found — add a folder with `project-config.json` to `data/`")

**Data source:** Filesystem scan of `data/*/project-config.json` at server startup or on demand.

**Relevant context:**

- [data/unicef/project-config.json](data/unicef/project-config.json) — Example project config with `project.name`, `jira`, `git`, `timeTracking`, `llm`, and `pipeline` sections
- [data/README.md](data/README.md) — Data directory conventions

---

### Panel 2 — ISV Calculator (Center / Main Panel)

The center panel is the primary workspace. It allows the user to trigger an ISV calculation for a single ticket and inspect all intermediate and final results.

#### 2a — Ticket Input

- [ ] **AC-2.1** An input field at the top accepts a ticket identifier (e.g. "UNICEF-123")
- [ ] **AC-2.2** The ticket prefix from `project-config.json → jira.ticketPrefix` is pre-filled or shown as a non-editable prefix label so the user only types the numeric part
- [ ] **AC-2.3** Pressing Enter or clicking a "Calculate" button triggers the ISV calculation pipeline
- [ ] **AC-2.4** While the pipeline is running, the UI shows a skeleton/shimmer placeholder for each result section (ticket info, pipeline steps, ISV result) so the layout is visible before data arrives; the input and button are disabled to prevent duplicate submissions
- [ ] **AC-2.5** If the pipeline returns an error, the error message (from `Result.error`) is displayed prominently with error code and source

#### 2b — Ticket Information

After the pipeline returns, the ticket metadata from the Jira client is displayed.

- [ ] **AC-2.6** Display the ticket title
- [ ] **AC-2.7** Display the ticket type with a distinguishing icon (e.g. Story, Task, Bug, Subtask — icon mapping for common Jira types)
- [ ] **AC-2.8** Display the ticket description, initially truncated (first ~3 lines), with an expand/collapse toggle to view the full text
- [ ] **AC-2.9** If the ticket has subtasks (other tickets with `parentId` matching this ticket), list them by title only
- [ ] **AC-2.10** Display ticket comments in a collapsed list; each comment shows the first line as a preview, expandable to full content

**Data source:** `Ticket` domain schema — fields: `ticketId`, `type`, `title`, `description`, `parentId`, `comments`, `storyPoints`, `labels`.

**Relevant context:**

- [packages/domain/src/ticket/ticket.schema.ts](packages/domain/src/ticket/ticket.schema.ts) — Normalized ticket schema
- [packages/domain/src/ticket/ticket-comment.schema.ts](packages/domain/src/ticket/ticket-comment.schema.ts) — Comment schema

#### 2c — Pipeline Step Results (Vertical Middle)

Below the ticket info, the intermediate results from each pipeline phase are displayed in order.

- [ ] **AC-2.11** **Status Quo Miner results**: display the `CodeHealthReport` per repository — volume metrics (LOC, file count), complexity metrics (avg cyclomatic complexity, duplication %, god class count), and test health (coverage %, outdated dependencies, dead code files)
- [ ] **AC-2.12** **Architecture Scanner results**: display the `SystemContext` per repository — system archetype, tech stack summary, adapter catalog, and core patterns
- [ ] **AC-2.13** **Health Scores & C2 derivation**: show the derived C2 State Factor per repository and the effective (aggregated) C2 across all repositories
- [ ] **AC-2.14** **Commit provenance**: for each repository, show which commit SHA was used for analysis, including the commit date/time and repository identifier — so the user knows exactly which code state the results are based on
- [ ] **AC-2.15** **Gap Analyzer results**: display the `GapAnalysisResult` — meta (actionability, confidence), architectural fit summary, identified gaps across four dimensions (data, UI, logic, integration), required modifications, and ISV scoring (A1, A2, B1, C1, D3 with rationale)

**Data source:** `CodeHealthReport`, `SystemContext`, `GapAnalysisResult`, `WorkingTree` (for commit SHA), `SystemBaseline` domain schemas.

**Relevant context:**

- [packages/domain/src/code-health/health-scores.schema.ts](packages/domain/src/code-health/health-scores.schema.ts) — HealthScores schema (influences C2)
- [packages/domain/src/system-context/system-context.schema.ts](packages/domain/src/system-context/system-context.schema.ts) — Architecture Scanner output
- [packages/domain/src/gap-analysis/gap-analysis-result.schema.ts](packages/domain/src/gap-analysis/gap-analysis-result.schema.ts) — Gap Analyzer output
- [packages/domain/src/baseline/system-baseline.schema.ts](packages/domain/src/baseline/system-baseline.schema.ts) — SystemBaseline with per-repo and effective C2

#### 2d — ISV Result (Bottom)

The final calculated ISV value is displayed prominently at the bottom.

- [ ] **AC-2.16** The final `isvScore` is displayed in a bold, visually prominent style (large font, accent color, or card element), pinned or bottom-aligned within the panel
- [ ] **AC-2.17** The formula breakdown is shown: `poValue` (functional value), `archFactor` (C1 × C2), `qualityMultiplier` (D3), and the full formula `ISV = poValue × archFactor × qualityMultiplier`
- [ ] **AC-2.18** All six input factors (A1, A2, B1, C1, C2, D3) are listed with their values
- [ ] **AC-2.19** The formula version identifier is displayed for traceability

**Data source:** `IsvResult` domain schema — fields: `isvScore`, `factors`, `breakdown`, `formulaVersion`.

**Relevant context:**

- [packages/domain/src/valuation/isv-result.schema.ts](packages/domain/src/valuation/isv-result.schema.ts) — Final ISV result schema
- [packages/domain/src/valuation/isv-breakdown.schema.ts](packages/domain/src/valuation/isv-breakdown.schema.ts) — Intermediate formula steps
- [packages/domain/src/valuation/isv-factors.schema.ts](packages/domain/src/valuation/isv-factors.schema.ts) — Six ISV factors

---

### Panel 3 — Calibration Context (Right Panel)

The right panel provides historical calibration data and plausibility context for the currently calculated ticket. This helps the analyst judge whether the ISV score is reasonable.

- [ ] **AC-3.1** Display the story points from the ticket (if available from `Ticket.storyPoints`)
- [ ] **AC-3.2** Display the sum of tracked hours for this ticket (or ticket group if the ticket has subtasks) sourced from the time tracking client
- [ ] **AC-3.3** Display the code changes (Git metrics) for the ticket or ticket group: lines added, lines deleted, files changed, distribution entropy, cyclomatic complexity delta, and change intensity score
- [ ] **AC-3.4** Provide an LLM-generated plausibility narrative that contextualizes the relationship between hours invested, code changes, and the ISV value — the LLM receives the ISV factors, score, hours, Git change metrics, and (if available) the calibrated Ship Rate, and produces a short human-readable assessment of whether the numbers are coherent or flag deviations
- [ ] **AC-3.5** If calibration data is not available (no time tracking, no Git history for this ticket), show an informational empty state rather than errors

**Data source:** `Ticket.storyPoints`, `TimeTrackingClient`, `GitClient` (log stats), `CalibrationResult` (Ship Rate for comparison), `GitChanges` schema.

**Relevant context:**

- [packages/domain/src/calibration/git-changes.schema.ts](packages/domain/src/calibration/git-changes.schema.ts) — Git change metrics
- [packages/domain/src/calibration/ship-unit-cluster.schema.ts](packages/domain/src/calibration/ship-unit-cluster.schema.ts) — Ship unit cluster with `metrics.totalHours` and `metrics.gitChanges`
- [packages/domain/src/calibration/calibration-result.schema.ts](packages/domain/src/calibration/calibration-result.schema.ts) — CalibrationResult with `shipRateHoursPerIsv`
- [packages/services/src/calibration/port.ts](packages/services/src/calibration/port.ts) — Calibration service port (clustering, time attribution)

---

## Edge Cases & Constraints

### Edge cases

- **Ticket not found**: Pipeline returns `TICKET_NOT_FOUND` — display error with the entered ticket ID and suggest verifying the number
- **Ticket has no subtasks**: Subtask section in Panel 2 is hidden or shows "No subtasks"
- **Ticket has no comments**: Comments section in Panel 2 is hidden or shows "No comments"
- **No time tracking data for ticket**: Right panel shows "No time tracking data available" instead of hours
- **No Git history for ticket**: Right panel shows "No code changes found" instead of Git metrics
- **Pipeline partial failure**: If an intermediate step fails (e.g. Architecture Scanner error), display the error at the point of failure and show whatever partial results were collected before the failure
- **Long-running pipeline**: The ISV pipeline involves Git checkout, static analysis, and LLM calls — the UI must handle calculations that may take 30+ seconds without timing out or appearing frozen
- **Empty data directory**: No projects in `data/` — sidebar shows empty state
- **Invalid project-config.json**: Skip and exclude from the project list; optionally log a warning
- **Multiple repositories per project**: `project-config.json → git.repositories` can list multiple repos — all per-repo results must be shown individually, grouped by repository
- **Description with HTML/Markdown**: Ticket descriptions from Jira may contain markup — render or sanitize appropriately

### Constraints

- **Read-only**: The UI is strictly read-only; it does not write back to any external system
- **Local-only**: The app runs exclusively on `localhost` via `pnpm dev` — there is no deployment target, no production build pipeline, and no hosting. Designed for single-user, local development use; no authentication required
- **Backend dependency**: The UI must consume the existing `@isv/pipelines`, `@isv/services`, `@isv/clients`, and `@isv/domain` packages — do not reimplement pipeline logic
- **Monorepo integration**: The app lives in the existing pnpm workspace (e.g. `packages/interfaces/web/`) and follows `pnpm-workspace.yaml` conventions
- **Dependency rule**: The UI (as an interface layer) may depend on `@isv/pipelines` and `@isv/domain`; it must not import from `@isv/services` or `@isv/clients` directly (following architecture: interfaces → pipelines → services → clients)
- **No client names in committed files**: Per AGENTS.md — never name specific clients in globally committed documentation or code; client names stay inside gitignored `data/` subfolders
- **Pipeline is async and slow**: LLM calls and Git operations create latency — the UI must provide appropriate feedback during processing (skeleton placeholders, not just spinners)

---

## Tech Stack

- **Framework**: SvelteKit (Svelte 5)
- **Styling**: Tailwind CSS
- **Package location**: `packages/interfaces/web/` (new pnpm workspace package, e.g. `@isv/web`)
- **Server-side**: SvelteKit server routes invoke the existing TypeScript pipelines directly (no separate API server needed)
- **Integration**: The SvelteKit server-side code imports from `@isv/pipelines` and `@isv/domain` to orchestrate calculations and type responses
- **Runtime**: Local dev server only (`pnpm dev`) — no production build or deployment target

---

## Visual Design & Styling

### Corporate Identity

The UI adopts the Bitgrip corporate identity. All colors, fonts, logo assets, and a suggested Tailwind config are documented in [ci-design-reference.md](ci-design-reference.md) (extracted from bitgrip.com on 2026-03-04, available offline). Logo files are in `assets/` beside that document.

- [ ] **AC-S.1** Use the Bitgrip logo SVG (`assets/logo_bitgrip.svg`) in the sidebar header or top-level navigation
- [ ] **AC-S.2** Apply the Bitgrip color palette as Tailwind CSS custom theme colors using the token mapping from [ci-design-reference.md](ci-design-reference.md) — primary brand `#0704FF`, text `#08082D`, accent reds, surface greys
- [ ] **AC-S.3** Use "Roboto Flex Variable" (variable font, weights 300–700) as the primary font family — loaded locally from bundled woff2 files (see `assets/fonts/` in [ci-design-reference.md](ci-design-reference.md)), no external CDN dependency
- [ ] **AC-S.4** Ensure the color palette meets WCAG AA contrast ratios for text on backgrounds

### Design Language

- [ ] **AC-S.5** Follow a modern, clean application design inspired by Tailwind UI component patterns — card-based layouts, clear section hierarchy, generous whitespace, subtle shadows and borders
- [ ] **AC-S.6** Use consistent spacing, border-radius, and elevation tokens from the Tailwind configuration
- [ ] **AC-S.7** Sidebar uses a darker or muted background to visually separate it from the content panels
- [ ] **AC-S.8** The center and right panels use a light background with card elements for each result section
- [ ] **AC-S.9** Interactive elements (buttons, inputs) follow Tailwind UI conventions — visible focus rings, hover states, disabled states
- [ ] **AC-S.10** Skeleton/shimmer loading states follow the same card layout structure so the page does not shift when data arrives
- [ ] **AC-S.11** Typography hierarchy: clear distinction between panel headings, section headings, labels, and body text using Tailwind's type scale

---

## Relevant Context

- [docs/concept/ISV Engine - 00 - The Big Picture.md](docs/concept/ISV%20Engine%20-%2000%20-%20The%20Big%20Picture.md) — End-to-end workflow: Fact Finder → Gap Analyzer → Valuation Engine
- [docs/architecture/architecture.md](docs/architecture/architecture.md) — Layered architecture and dependency rule
- [CONTRIBUTING.md](CONTRIBUTING.md) — Monorepo structure, source code conventions, tech stack decisions
- [packages/interfaces/README.md](packages/interfaces/README.md) — Interface layer overview (CLI exists, API planned, web is new)
- [packages/pipelines/src/isv-calculation/port.ts](packages/pipelines/src/isv-calculation/port.ts) — `IsvCalculationPipelinePort.run(ticketId, config)` — the primary backend entry point for the center panel
- [packages/pipelines/src/isv-calculation/pipeline.ts](packages/pipelines/src/isv-calculation/pipeline.ts) — Full pipeline implementation: Steps 1–9 from ticket fetch through ISV scoring
- [packages/pipelines/src/historical-calibration/port.ts](packages/pipelines/src/historical-calibration/port.ts) — Calibration pipeline (batch) — right panel may consume prior calibration results
- [pnpm-workspace.yaml](pnpm-workspace.yaml) — Workspace includes `packages/interfaces/*`

---

## Resolved Design Decisions

The following questions were raised during requirements analysis and have been resolved:

| # | Question | Decision | Impact |
| --- | --- | --- | --- |
| 1 | **Subtask resolution** — enrich pipeline result or separate ticket query? | **Enrich pipeline result.** Subtasks are already fetched during ticket retrieval; keep and pass them through the pipeline result so the UI receives them without an extra query. | @Architect: extend the pipeline return type to include subtask `Ticket[]` alongside the `IsvResult`. |
| 2 | **Per-ticket calibration data** — lightweight lookup or pre-computed file? | **Lightweight lookup.** The UI triggers a per-ticket lookup for hours and Git changes on demand (not batch). | @Architect: design a lightweight calibration-context query that fetches time + Git data for one ticket/cluster without running the full calibration pipeline. |
| 3 | **Pipeline progress reporting** — events/callbacks or polling? | **Polling with skeleton UI.** The simpler approach: the UI shows skeleton/shimmer placeholders immediately and polls for the final result. No intermediate event mechanism needed in v1. | @Architect: ensure the server route returns promptly with a calculation ID and supports a status-check endpoint, or use SvelteKit streaming if simpler. |
| 4 | **Plausibility summary** — deterministic thresholds or LLM narrative? | **LLM narrative.** The plausibility summary (AC-3.4) is generated by the LLM. It receives IsvResult, hours, Git metrics, and Ship Rate, and produces a short human-readable assessment. | @Architect: define the plausibility prompt contract and the service boundary for this LLM call. |
| 5 | **Commit provenance** — data shape for surfacing `WorkingTree.commitSha`? | **Include commit SHA, timestamp, and repository ID per repo in the enriched pipeline result.** Perfect for showing exactly which code state was analyzed. | @Architect: add a `provenance` array (repoId, commitSha, commitDate) to the enriched pipeline result type. |

## Open Questions

- **Skeleton granularity**: Should each pipeline step get its own skeleton card, or one skeleton for the entire center panel? — Can be decided during implementation
