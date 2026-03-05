# Pipeline Progress UX Requirements

## User Story

As a **Technical Analyst using the ISV Web UI**, I want **real-time visibility into how the ISV calculation is progressing — seeing step-by-step results as they complete and knowing roughly how long the process takes** so that I can **understand what the engine is doing, feel confident the system is working, and use my waiting time effectively**.

---

## Scope

### In scope

- Duration estimate banner displayed at calculation start
- Step-by-step progress indicator reflecting the 9 pipeline stages
- Incremental result rendering: replace skeletons with real data as each step completes
- Server-sent events (SSE) or chunked streaming from the `/api/calculate` endpoint to push intermediate results
- Elapsed timer visible during calculation

### Out of scope

- Cancel / abort a running calculation (separate feature)
- Parallel pipeline execution or performance optimizations to reduce total time
- Persistent history of past calculations
- Notification when calculation completes if the user navigated away

---

## Acceptance Criteria

### AC-1: Duration Estimate Banner

- [ ] AC-1.1: When calculation starts, a banner appears below the ticket input with text: _"ISV calculations typically take 3–6 minutes depending on repository size."_
- [ ] AC-1.2: The banner includes an elapsed-time counter in `mm:ss` format, starting at `00:00`.
- [ ] AC-1.3: The elapsed timer updates every second while the calculation is in progress.
- [ ] AC-1.4: When the calculation completes (success or error), the banner shows the total elapsed time and stops counting.
- [ ] AC-1.5: The banner is dismissed when the user starts a new calculation or switches projects.

### AC-2: Step Progress Indicator

- [ ] AC-2.1: A compact progress tracker is visible during calculation, listing the pipeline steps in order:
  1. Fetching ticket
  2. Checking out repositories
  3. Analyzing code health (Status Quo Miner)
  4. Scanning architecture (per repository, LLM-based)
  5. Deriving quality state (C2)
  6. Analyzing requirements gap (LLM-based)
  7. Assembling ISV factors
  8. Calculating ISV score
- [ ] AC-2.2: Each step shows one of three states: _pending_ (dimmed), _in-progress_ (spinner/pulse), _completed_ (checkmark).
- [ ] AC-2.3: Steps that involve LLM calls (Architecture Scanner, Gap Analyzer) display a subtle label: _"AI-assisted — may take 1-2 min"_.
- [ ] AC-2.4: If a step fails, it shows an error icon and the remaining steps show as _skipped_.
- [ ] AC-2.5: The progress tracker collapses or hides once results are fully loaded.

### AC-3: Incremental Result Rendering

- [ ] AC-3.1: The API endpoint streams intermediate results as they become available (e.g. via SSE or newline-delimited JSON).
- [ ] AC-3.2: When the ticket-fetch step completes, the Ticket Information card replaces its skeleton with real data immediately.
- [ ] AC-3.3: When the status-quo-miner step completes, the Code Health section replaces its skeleton with real data.
- [ ] AC-3.4: When the architecture-scanner step completes (per repo), the Architecture / System Context section updates incrementally.
- [ ] AC-3.5: When the gap-analyzer step completes, the Gap Analysis section replaces its skeleton with real data.
- [ ] AC-3.6: When the final ISV score is calculated, the ISV Result card and sticky bar appear.
- [ ] AC-3.7: Each card transition uses a brief fade-in animation (CSS transition, ~300 ms) so results don't pop in abruptly.
- [ ] AC-3.8: If the SSE connection drops mid-calculation, the UI shows a recoverable error with a "Retry" option.

### AC-4: Loading State Improvements

- [ ] AC-4.1: Skeleton cards remain for steps that have not yet completed — they are replaced one-by-one, not all at once.
- [ ] AC-4.2: The Calculate button still shows its spinner and "Calculating…" text for the full duration (existing behavior preserved).
- [ ] AC-4.3: The Calibration Context panel (right sidebar) shows its own skeleton until calibration data is available.

---

## Edge Cases & Constraints

- **Long-running LLM steps**: Architecture Scanner and Gap Analyzer each invoke GitHub Copilot CLI, which can take 1-2 minutes per call. The UX must convey that this is expected, not stuck.
- **Multi-repo projects**: Architecture scanning runs sequentially per repository. The progress indicator should reflect per-repo sub-progress (e.g. "Scanning architecture — repo 2 of 3").
- **Error mid-pipeline**: If Step 4 (arch scanner) fails for one repo, the pipeline returns early. The progress indicator must transition remaining steps to _skipped_, and partial results already rendered should remain visible.
- **Browser tab backgrounded**: The elapsed timer and SSE listener must continue to function when the browser tab is not focused.
- **Concurrent calculations**: Only one calculation per browser session at a time (existing constraint). Starting a new calculation discards previous streaming state.
- **Vite dev server**: The streaming approach must not interfere with Vite's HMR WebSocket (the previous `process.chdir()` bug is a cautionary precedent).

---

## Relevant Context

- [pipeline.ts](packages/pipelines/src/isv-calculation/pipeline.ts) — 9-step pipeline implementation; each step boundary is where progress events should be emitted
- [enriched-result.ts](packages/pipelines/src/isv-calculation/enriched-result.ts) — Result shape: `ticket`, `pipelineResults` (repositories, effectiveC2, gapAnalysis), `isvResult`, `calibration`
- [+server.ts](packages/interfaces/web/src/routes/api/calculate/+server.ts) — Current monolithic POST endpoint; needs to be refactored to stream intermediate results
- [+page.svelte](packages/interfaces/web/src/routes/+page.svelte) — Main page; currently uses a single `loading` boolean and swaps all skeletons at once
- [Skeleton.svelte](packages/interfaces/web/src/lib/components/Skeleton.svelte) — Existing shimmer placeholder component
- [TicketInput.svelte](packages/interfaces/web/src/lib/components/TicketInput.svelte) — Button already shows spinner during `loading`
- [Card.svelte](packages/interfaces/web/src/lib/components/Card.svelte) — Reusable container for each result section
- [PipelineResults.svelte](packages/interfaces/web/src/lib/components/PipelineResults.svelte) — Renders code health, system context, C2, gap analysis
- [IsvResult.svelte](packages/interfaces/web/src/lib/components/IsvResult.svelte) — Final score display
- [StickyIsvResult.svelte](packages/interfaces/web/src/lib/components/StickyIsvResult.svelte) — Sticky bottom bar with score

---

## Open Questions

- **Streaming transport**: SSE (Server-Sent Events) is the simplest SvelteKit-compatible streaming approach. Alternatively, the endpoint could use chunked `Transfer-Encoding` with newline-delimited JSON. Both work with SvelteKit's `Response` streaming. — @Architect: Which approach best fits the existing SvelteKit setup and avoids dev-server interference?
- **Pipeline event contract**: The pipeline currently returns `Result<EnrichedIsvResult>` as a single value. To support streaming, it needs a callback or async-iterable interface that emits intermediate events. — @Architect: What's the minimal change to the pipeline port that preserves the existing synchronous return path (for CLI) while supporting streaming for the web?
- **Elapsed time vs. estimated time**: Should the UI show only elapsed time, or also an ETA based on historical averages? ETA is more useful but adds complexity (need to store past run durations). The simplest start is elapsed-only with a static "typically 3-6 min" note.
