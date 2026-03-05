# Pipeline Progress Streaming — Development Task

## User Story

As a **developer**, I want to **implement the Observer Callback pattern (Option A) across the pipeline, API, and UI layers** so that **the ISV Web UI can show step-by-step progress and incremental results during the ~5-minute ISV calculation, while the existing POST endpoint and CLI interface remain unchanged**.

**References:**
- [Pipeline Progress UX Requirements](pipeline-progress-ux.md) — acceptance criteria and edge cases
- Architectural decision: **Option A (Observer Callback)** — approved by Architect

**Key decisions:**
- Keep `POST /api/calculate` as-is (CLI and non-streaming clients)
- New `GET /api/calculate/stream` SSE endpoint with query parameters (`ticketId`, `projectSlug`)
- `onProgress` callback is optional on `run()` — zero impact on existing callers
- Same pattern will be applied to `HistoricalCalibrationPipeline` later (out of scope here)

---

## Subtask 1: Pipeline Progress Event Contract

**Layer:** `@isv/pipelines`

**Goal:** Define the `PipelineProgressEvent` type and add the optional `onProgress` callback parameter to the pipeline port and implementation.

### Files to change

| File | Change |
|---|---|
| `packages/pipelines/src/isv-calculation/port.ts` | Add `PipelineStepId`, `PipelineProgressEvent`, `PipelineProgressCallback` types. Add optional third parameter `onProgress?: PipelineProgressCallback` to `run()`. |
| `packages/pipelines/src/isv-calculation/pipeline.ts` | Accept `onProgress` in `run()`. Call `onProgress?.()` at each of the 8 step boundaries with real step data. |
| `packages/pipelines/src/isv-calculation/index.ts` | Re-export `PipelineStepId`, `PipelineProgressEvent`, `PipelineProgressCallback`. |

### Type definitions to add in `port.ts`

```ts
/** Identifiers for each discrete pipeline step. */
type PipelineStepId =
  | "ticket-fetched"
  | "repos-checked-out"
  | "code-health-mined"
  | "architecture-scanned"   // emitted per repo
  | "c2-derived"
  | "gap-analyzed"
  | "factors-assembled"
  | "isv-calculated";

/** Progress event emitted by the pipeline at each step boundary. */
interface PipelineProgressEvent {
  step: PipelineStepId;
  completedSteps: number;
  totalSteps: number;
  /** Partial result payload — shape depends on step. */
  data?: unknown;
  /** Human-readable detail for sub-progress (e.g. "repo 2 of 3"). */
  detail?: string;
}

/** Callback type for progress observers. */
type PipelineProgressCallback = (event: PipelineProgressEvent) => void;
```

### Updated port signature

```ts
interface IsvCalculationPipelinePort {
  run(
    ticketId: string,
    config: IsvCalculationConfig,
    onProgress?: PipelineProgressCallback,
  ): Promise<Result<EnrichedIsvResult>>;
}
```

### Emission points in `pipeline.ts`

| Pipeline location | Step ID | `data` payload | `detail` |
|---|---|---|---|
| After ticket fetch (Step 1) | `ticket-fetched` | `{ ticket }` | — |
| After `checkoutAll` (Step 2) | `repos-checked-out` | `{ repositoryIds: string[] }` | — |
| After `statusQuoMiner.mine()` (Step 3) | `code-health-mined` | `{ codeHealthReports }` | — |
| After each `architectureScanner.scan()` (Step 4 loop) | `architecture-scanned` | `{ repositoryId, systemContext, codeHealthReport, c2State }` | `"repo 1 of 3"` |
| After C2 aggregation (Step 5–6) | `c2-derived` | `{ effectiveC2, repositories }` | — |
| After `gapAnalyzer.analyze()` (Step 7) | `gap-analyzed` | `{ gapAnalysis }` | — |
| After factor assembly (Step 8) | `factors-assembled` | `{ factors }` | — |
| After `valuation.calculate()` (Step 9) | `isv-calculated` | `{ isvResult, calibration }` | — |

**`totalSteps` calculation:** Base steps = 5 (ticket, checkout, mine, C2, gap, factors, isv) + number of repositories (for architecture-scanned). For a 3-repo project: `totalSteps = 5 + 3 = 8`. This is computed at Step 2 when `repoIds` is known.

### Acceptance criteria

- [ ] ST1-AC1: `PipelineStepId`, `PipelineProgressEvent`, `PipelineProgressCallback` types are exported from `@isv/pipelines`.
- [ ] ST1-AC2: `run()` accepts an optional third parameter `onProgress?: PipelineProgressCallback`.
- [ ] ST1-AC3: Calling `run()` without `onProgress` behaves identically to the current implementation (backward-compatible).
- [ ] ST1-AC4: Calling `run()` with `onProgress` emits events at all 8 step boundaries in correct order.
- [ ] ST1-AC5: `completedSteps` increments from 1 to `totalSteps` across all events.
- [ ] ST1-AC6: Each event's `data` payload contains the partial result for that step (serializable to JSON).
- [ ] ST1-AC7: `architecture-scanned` events include `detail` with `"repo N of M"` format.
- [ ] ST1-AC8: If the pipeline fails mid-execution, no further `onProgress` calls are made after the error.
- [ ] ST1-AC9: `onProgress` errors (if the callback throws) do not crash the pipeline — they are caught and logged.

### Testing

- Add tests to `isv-calculation.boundary.test.ts`:
  - Test that `onProgress` receives events in the correct order with correct `step` values.
  - Test that `completedSteps` increments correctly.
  - Test that running without `onProgress` still returns the full `EnrichedIsvResult`.
  - Test that a throwing `onProgress` does not break the pipeline.

---

## Subtask 2: SSE Streaming Endpoint

**Layer:** `@isv/web`

**Goal:** Create a new `GET /api/calculate/stream` endpoint that runs the pipeline with `onProgress`, translating each callback into an SSE event pushed to the browser.

### Files to create / change

| File | Change |
|---|---|
| `packages/interfaces/web/src/routes/api/calculate/stream/+server.ts` | **New** — SSE GET endpoint |

### Endpoint design

```
GET /api/calculate/stream?ticketId=UNICEF-19106&projectSlug=unicef
```

**Response:** `Content-Type: text/event-stream`

**SSE event format:**

```
data: {"step":"ticket-fetched","completedSteps":1,"totalSteps":8,"data":{...}}

data: {"step":"code-health-mined","completedSteps":3,"totalSteps":8,"data":{...}}

event: done
data: {"success":true,"data":{...enrichedResult}}

event: error
data: {"code":"PIPELINE_FAILED","message":"...","source":"..."}
```

### Implementation sketch

1. Validate `ticketId` and `projectSlug` query parameters.
2. Read project config via `readProjectConfig(projectSlug)`.
3. Create pipeline via `createIsvCalculationFromConfig(projectConfig, { cwd: monorepoRoot() })`.
4. Return a `new Response(readableStream, { headers: { "Content-Type": "text/event-stream", ... } })`.
5. Inside the `ReadableStream` start callback:
   - Define `onProgress` that writes `data: ${JSON.stringify(event)}\n\n` to the stream controller.
   - Call `pipeline.run(ticketId, config, onProgress)`.
   - On success: write `event: done\ndata: ${JSON.stringify(result)}\n\n`, then close.
   - On error: write `event: error\ndata: ${JSON.stringify(error)}\n\n`, then close.
   - In `finally`: call `cleanup()`.

### Acceptance criteria

- [ ] ST2-AC1: `GET /api/calculate/stream?ticketId=X&projectSlug=Y` returns `Content-Type: text/event-stream`.
- [ ] ST2-AC2: Missing or empty query parameters return HTTP 400 JSON error (not SSE).
- [ ] ST2-AC3: Unknown `projectSlug` returns HTTP 404 JSON error.
- [ ] ST2-AC4: Each `onProgress` event is written as an SSE `data:` line.
- [ ] ST2-AC5: Final result is written as `event: done\ndata: ...\n\n`.
- [ ] ST2-AC6: Pipeline errors are written as `event: error\ndata: ...\n\n`.
- [ ] ST2-AC7: The response includes `Cache-Control: no-cache` and `Connection: keep-alive` headers.
- [ ] ST2-AC8: The stream closes after the `done` or `error` event.
- [ ] ST2-AC9: `POST /api/calculate` (existing endpoint) continues to work unchanged.
- [ ] ST2-AC10: The SSE endpoint does not call `process.chdir()` (uses `cwd` option on the factory).

---

## Subtask 3: UI Pipeline Progress Component

**Layer:** `@isv/web` (components)

**Goal:** Create a `PipelineProgress.svelte` component that shows step-by-step progress during calculation.

### Files to create

| File | Purpose |
|---|---|
| `packages/interfaces/web/src/lib/components/PipelineProgress.svelte` | Step tracker with 8 steps |
| `packages/interfaces/web/src/lib/components/ElapsedTimer.svelte` | `mm:ss` elapsed counter |

### `PipelineProgress.svelte` design

**Props:**

```ts
{
  steps: Array<{
    id: PipelineStepId;
    label: string;
    status: "pending" | "in-progress" | "completed" | "error" | "skipped";
    aiAssisted?: boolean;
    detail?: string;
  }>;
  visible: boolean;
}
```

**Visual states per step:**
- `pending` — Dimmed text, no icon
- `in-progress` — Pulse animation, spinner icon
- `completed` — Green checkmark icon, normal text
- `error` — Red exclamation icon, error text color
- `skipped` — Dimmed text, dash icon

**AI label:** Steps with `aiAssisted: true` show a subtle `"AI-assisted — may take 1–2 min"` tag when `in-progress`.

**Collapse behavior:** The progress tracker auto-collapses (accordion-style) once all steps are `completed`. A toggle allows re-expanding.

### `ElapsedTimer.svelte` design

**Props:** `{ running: boolean }`

Uses `setInterval` (1 s) while `running === true`. Displays `mm:ss`. Stops and shows final time when `running` becomes `false`.

### Acceptance criteria

- [ ] ST3-AC1: `PipelineProgress.svelte` renders all 8 pipeline steps in correct order.
- [ ] ST3-AC2: Each step displays the correct visual state (pending/in-progress/completed/error/skipped).
- [ ] ST3-AC3: LLM-assisted steps (Architecture Scanner, Gap Analyzer) show the AI label when in-progress.
- [ ] ST3-AC4: Multi-repo sub-progress detail text is visible for `architecture-scanned` steps.
- [ ] ST3-AC5: Progress tracker auto-collapses after all steps complete.
- [ ] ST3-AC6: `ElapsedTimer.svelte` counts up in `mm:ss` format when running.
- [ ] ST3-AC7: Timer stops and displays final elapsed time when `running` becomes `false`.
- [ ] ST3-AC8: Timer continues to count when the browser tab is backgrounded.

---

## Subtask 4: Incremental Result Rendering in `+page.svelte`

**Layer:** `@isv/web` (page)

**Goal:** Refactor `handleCalculate` to use `EventSource` for the streaming endpoint, updating per-step reactive state so that result cards replace skeletons incrementally.

### Files to change

| File | Change |
|---|---|
| `packages/interfaces/web/src/routes/+page.svelte` | Replace single `fetch()` + `loading` boolean with `EventSource` + per-step state |
| `packages/interfaces/web/src/lib/types/index.ts` | Add `PipelineStepState` and step-related client types |

### State model change

**Current:**
```ts
let loading = $state(false);
let ticketData = $state<Record<string, unknown> | null>(null);
let pipelineResults = $state<Record<string, unknown> | null>(null);
let isvResult = $state<Record<string, unknown> | null>(null);
let calibrationData = $state<Record<string, unknown> | null>(null);
```

**New (additive — keep existing state variables):**
```ts
let streaming = $state(false);              // true while SSE connection is open
let currentStep = $state<string | null>(null);
let completedSteps = $state(0);
let totalSteps = $state(0);
let stepStates = $state<Map<string, "pending" | "in-progress" | "completed" | "error" | "skipped">>(new Map());
let stepDetails = $state<Map<string, string>>(new Map());
```

### `handleCalculate` refactored flow

1. Reset all state. Set `loading = true`, `streaming = true`.
2. Construct URL: `/api/calculate/stream?ticketId=${encodeURIComponent(ticketId)}&projectSlug=${encodeURIComponent(activeSlug)}`.
3. Open `EventSource`.
4. On `message` event:
   - Parse `PipelineProgressEvent`.
   - Update `stepStates` — mark previous step as `completed`, current step as `in-progress`.
   - Update `completedSteps`, `totalSteps`, `currentStep`, `stepDetails`.
   - Map step data to the existing result state variables:
     - `ticket-fetched` → set `ticketData`
     - `code-health-mined` → set partial `pipelineResults.repositories`
     - `architecture-scanned` → append to `pipelineResults.repositories`
     - `c2-derived` → set `pipelineResults.effectiveC2`
     - `gap-analyzed` → set `pipelineResults.gapAnalysis`
     - `isv-calculated` → set `isvResult`, `calibrationData`
5. On `done` event: Close `EventSource`. Set `loading = false`, `streaming = false`. Mark all steps `completed`.
6. On `error` event: Close `EventSource`. Set error state. Mark remaining steps `skipped`.
7. On `EventSource` error (connection drop): Show recoverable error with "Retry" button.

### Duration estimate banner

Display between the TicketInput bar and the results area when `loading === true`:

```
┌─────────────────────────────────────────────────────┐
│ ⏱ 02:34  ISV calculations typically take 3–6 min.  │
│                                                     │
│ ● Fetching ticket ✓                                 │
│ ● Checking out repositories ✓                       │
│ ◉ Analyzing code health...        (Step 3 of 8)     │
│ ○ Scanning architecture                             │
│ ○ Deriving quality state                            │
│ ○ Analyzing requirements gap                        │
│ ○ Assembling ISV factors                            │
│ ○ Calculating ISV score                             │
└─────────────────────────────────────────────────────┘
```

### Card fade-in

Each result card uses a CSS transition (`opacity` + `transform`, ~300 ms) when its data changes from `null` to populated. This can be achieved with Svelte's `{#if}` block plus a `transition:fade` or CSS `.animate-fade-in` class.

### Acceptance criteria

- [ ] ST4-AC1: Clicking "Calculate" opens an `EventSource` to `/api/calculate/stream`.
- [ ] ST4-AC2: The duration estimate banner with elapsed timer appears below the ticket input.
- [ ] ST4-AC3: The `PipelineProgress` component displays and updates step states in real time.
- [ ] ST4-AC4: When `ticket-fetched` arrives, the Ticket Information card replaces its skeleton with data.
- [ ] ST4-AC5: When `code-health-mined` arrives, the Code Health section replaces its skeleton.
- [ ] ST4-AC6: When `architecture-scanned` arrives (per repo), the Architecture section updates incrementally.
- [ ] ST4-AC7: When `gap-analyzed` arrives, the Gap Analysis section replaces its skeleton.
- [ ] ST4-AC8: When `isv-calculated` arrives, the ISV Result card and sticky bar appear.
- [ ] ST4-AC9: Each card replacement uses a fade-in transition (~300 ms).
- [ ] ST4-AC10: If the SSE connection drops, a recoverable error with "Retry" option is shown.
- [ ] ST4-AC11: Starting a new calculation closes any previous `EventSource` connection.
- [ ] ST4-AC12: Switching projects closes any active `EventSource` and resets all state.
- [ ] ST4-AC13: The existing `loading` state and button spinner remain functional throughout.

---

## Subtask 5: Config Factory Pass-Through

**Layer:** `@isv/pipelines`

**Goal:** Ensure `createIsvCalculationFromConfig` returns a pipeline whose `run()` supports the `onProgress` parameter without the factory needing to change its public API.

### Analysis

The config factory creates the pipeline via `createIsvCalculationPipeline(deps)` and returns it as `IsvCalculationPipelinePort`. Since `onProgress` is an optional parameter on `run()`, and the factory returns the concrete implementation that implements the updated `run()`, this should work transparently. **No config-factory code changes needed** — just verify via the existing boundary test.

### Acceptance criteria

- [ ] ST5-AC1: `createIsvCalculationFromConfig(config, { cwd }).data.pipeline.run(ticketId, pipelineConfig, onProgress)` correctly forwards progress events.
- [ ] ST5-AC2: Existing `createIsvCalculationFromConfig` boundary tests still pass.

---

## Implementation Order

```
Subtask 1 (Pipeline event contract)
    ↓
Subtask 5 (Config factory verification)
    ↓
Subtask 2 (SSE endpoint)
    ↓
Subtask 3 (Progress components)    ← can parallel with Subtask 2
    ↓
Subtask 4 (Page integration)       ← depends on Subtask 2 + 3
```

Subtasks 1 → 5 → 2 are strictly sequential (each depends on the previous). Subtask 3 (components) can be developed in parallel with Subtask 2 (SSE endpoint) since they share only the type contract from Subtask 1. Subtask 4 integrates everything.

---

## Testing Strategy

| Subtask | Test tier | Test type |
|---|---|---|
| ST1 | Tier 3 | `isv-calculation.boundary.test.ts` — mock services, verify `onProgress` event sequence |
| ST2 | — | Manual: `curl -N "http://localhost:5173/api/calculate/stream?ticketId=UNICEF-19106&projectSlug=unicef"` |
| ST3 | Tier 1 | Unit tests for `ElapsedTimer` logic (optional, pure time math) |
| ST4 | — | Manual: browser end-to-end with real UNICEF project |
| ST5 | Tier 3 | Existing `config-factory.boundary.test.ts` (verify no regression) |

---

## Out of Scope (Future Work)

- Cancel / abort running calculation
- Historical Calibration pipeline streaming (same pattern, separate task)
- ETA based on historical run durations (requires persistence)
- CLI pipeline progress (console-based step output)
