# ISV Engine — Implementation Roadmap

> **Last updated:** 2026-03-04
>
> **Status key:** ✅ Done | 🔲 Open | 🚧 In Progress

---

## Current State

| Layer | Status |
| --- | --- |
| Domain schemas (`@isv/domain`) | ✅ 38 Zod schemas across 9 modules — fully defined |
| Git client | ✅ Bare-clone + worktree adapter, factory, real-world tests |
| Jira client | ✅ XML adapter, factory, integration + real-world tests |
| LLM client | ✅ GitHub Copilot CLI adapter, factory, integration tests |
| Time-tracking client | ✅ Teamleader Excel adapter, factory, integration tests |
| Static-analysis client | 🚧 Port + client interfaces defined; no adapter implementation yet |
| All 5 services | 🔲 Empty stubs (`export {}`) |
| Both pipelines | 🔲 Empty stubs (`export {}`) |
| Interfaces (CLI / API) | 🔲 Not started |

---

## Milestone Overview

```text
M0  ── Domain Audit ──────────────────────────────────┐
│                                                      │
├── M1  Static Analysis Client ────────────────────┐   │
│                                                  │   │
├── M2a Status Quo Miner Service ──────────────────┤   │
│                                                  │   │
├── M2b Architecture Scanner Service ──────────────┤   │
│                                                  │   │
│   ┌──────────────────────────────────────────────┘   │
│   │                                                  │
│   ├── QG-1  Fact Finder Integration Gate ────────────┤
│   │                                                  │
├── M3  Valuation Service (parallel with M2a/M2b) ─────┤
│   │                                                  │
│   ├── QG-2  Formula Correctness Gate ────────────────┤
│   │                                                  │
│   ├── M4  Gap Analyzer Service ──────────────────────┤
│   │                                                  │
│   ├── QG-3  Gap Analyzer Real-World Gate ────────────┤
│   │                                                  │
│   ├── R1  Domain Model Review ───────────────────────┤
│   │                                                  │
│   ├── M5  ISV Calculation Pipeline (Use Case 2) ─────┤
│   │                                                  │
│   ├── QG-4  Single-Ticket E2E Gate ──────────────────┤
│   │                                                  │
│   ├── M6  Calibration Service ───────────────────────┤
│   │                                                  │
│   ├── M7  Historical Calibration Pipeline (UC 1) ────┤
│   │                                                  │
│   ├── QG-5  Calibration Statistical Gate ────────────┤
│   │                                                  │
│   ├── R2  Architecture Hygiene Review ───────────────┤
│   │                                                  │
│   └── M8  Interfaces (CLI + API) ────────────────────┘
```

---

## M0 — Domain Audit & Harmonisation

**Goal:** Ensure all concept docs, domain schemas, and ISV factor scales are fully aligned before any service builds on top.

- [x] Harmonise ISV factor scales to Fibonacci integers across all docs and schemas
- [x] Reconcile Valuation concept doc (v3.3 → v3.4): Fibonacci scales, C2 derivation formula, D3 ownership
- [x] Reconcile Gap Analyzer concept doc (v3.0 → v3.4): Fibonacci scales, add D3 to scoring output
- [x] Add `D3_Quality` to `IsvScoringSchema` (gap-analysis module)
- [x] Update `IsvFactorsSchema` descriptions: C2 owned by Valuation service, D3 from Gap Analyzer
- [x] Create `ProjectConfigSchema` with `d3QualityFloor` (shared module)
- [x] Add per-repo `c2State` + aggregated `effectiveC2` to `SystemBaselineSchema`
- [x] Update Status Quo Miner concept doc: scc + jscpd + knip (drop cloc)
- [x] Update techstack.md key libraries: static analysis tools, `execa + git CLI`
- [x] Remove stale `cloc` references from `structural-facts.schema.ts`

**Exit criteria:** `pnpm check` clean, `pnpm test` green, no concept-to-schema scale conflicts.

---

## M1 — Static Analysis Client

**Goal:** Implement CLI wrappers for scc, jscpd, and knip so the Status Quo Miner can collect metrics.

- [x] Define `StaticAnalysisPort` interface (scc, jscpd, knip methods)
- [x] Define `StaticAnalysisClient` interface
- [x] Create static-analysis README
- [ ] Implement scc adapter (parse JSON output via `execa`)
- [ ] Implement jscpd adapter (parse JSON reporter output)
- [ ] Implement knip adapter (parse JSON output)
- [ ] Implement `StaticAnalysisClient` factory wiring adapters together
- [ ] Write Tier 2 adapter tests with `__fixtures__/` for each tool
- [ ] Write integration test: factory → adapter → domain types
- [ ] Add real-world test against the ISV Engine repo itself

**Exit criteria:** `StaticAnalysisClient.analyze(dir)` returns valid `StructuralFacts` + `HealthScores` for a real repository.

---

## M2a — Status Quo Miner Service

**Goal:** First runnable service: Git checkout → static analysis → entry-point counting → `CodeHealthReport`.

- [ ] Define service interface: `(repos: WorkingTree[], timestamp: IsoTimestamp) → CodeHealthReport[]`
- [ ] Implement metric collection: call `StaticAnalysisClient.analyze()` per repo
- [ ] Implement entry-point detection (file-pattern search for controllers/views)
- [ ] Implement Git hotspot extraction (via `GitClient.logStats()`)
- [ ] Assemble `CodeHealthReport` per repository
- [ ] Write Tier 3 boundary tests with fixture-backed mocks
- [ ] Add real-world test: run against ISV Engine repo at HEAD

**Exit criteria:** Given a checked-out repo, produces a schema-valid `CodeHealthReport`.

---

## M2b — Architecture Scanner Service

**Goal:** LLM-assisted Phase 1: source code → `SystemContext` structured output.

- [ ] Define service interface: `(workingDir: string, llm: LlmClient) → SystemContext`
- [ ] Design system prompt (from concept doc) with Zod-schema-aligned JSON output instructions
- [ ] Implement prompt construction: directory listing + key file sampling
- [ ] Implement LLM invocation via `LlmClient.prompt()`
- [ ] Implement response parsing + Zod validation of `SystemContextSchema`
- [ ] Add confidence gate: reject low-confidence or malformed responses
- [ ] Write Tier 3 boundary tests with mock LLM responses from `__fixtures__/`
- [ ] Add real-world test: scan ISV Engine repo → validate `SystemContext` structure

**Exit criteria:** Given a repo directory and LLM, produces a schema-valid `SystemContext`.

---

## QG-1 — Fact Finder Integration Gate

**Blocker for:** M4 (Gap Analyzer), M5 (ISV Calculation Pipeline)

- [ ] Real-world test: for the ISV Engine repo, run both Status Quo Miner and Architecture Scanner
- [ ] Assert `CodeHealthReport` passes `CodeHealthReportSchema.parse()`
- [ ] Assert `SystemContext` passes `SystemContextSchema.parse()`
- [ ] Assemble `RepositoryBaseline` from both outputs — assert schema-valid
- [ ] Build `SystemBaseline` with single repo — assert schema-valid
- [ ] Test named `fact-finder.realworld.test.ts` in `packages/services/`

**Pass criteria:** Both Phase 1 services produce schema-valid outputs that compose into a valid `SystemBaseline`.

---

## M3 — Valuation Service

**Goal:** Pure deterministic formula engine: `IsvFactors → IsvResult`. No AI.

- [ ] Implement ISV formula: `((A1 × A2) + B1) × (C1 × C2) × D3`
- [ ] Implement `IsvBreakdown` calculation (poValue, archFactor, qualityMultiplier)
- [ ] Implement C2 derivation: `HealthScores → C2State` using the penalty model from Valuation v3.4
- [ ] Implement multi-repo C2 aggregation: max across per-repo C2 values
- [ ] Write unit tests: all four concept-doc case studies (React=4, Salesforce=70, Migration=8, Bugfix/Toxic=6)
- [ ] Write unit tests: C2 derivation boundary conditions (penalty sums 0→1→2→4→5→7)
- [ ] Write unit tests: edge cases (all factors at minimum, all at maximum)

**Exit criteria:** Formula matches all documented case studies; C2 derivation is deterministic and tested.

> **Note:** M3 can be developed in parallel with M2a/M2b since it depends only on domain schemas.

---

## QG-2 — Formula Correctness Gate

**Blocker for:** M5 (ISV Calculation Pipeline)

- [ ] All four case-study scenarios produce exact expected ISV scores
- [ ] C2 derivation: `HealthScores` → C2 boundary tests pass for all threshold transitions
- [ ] D3 floor from `ProjectConfig` is respected (ticket D3 ≥ floor)
- [ ] Test named `valuation.formula.test.ts` in `packages/services/`

**Pass criteria:** Deterministic formula + C2 derivation is correct and regression-tested.

---

## M4 — Gap Analyzer Service

**Goal:** LLM-assisted Phase 2: `SystemBaseline + Ticket → GapAnalysisResult` with structured output.

- [ ] Define service interface: `(baseline: SystemBaseline, ticket: Ticket, config: ProjectConfig, llm: LlmClient) → GapAnalysisResult`
- [ ] Design analysis prompt from Gap Analyzer concept doc (v3.4 Fibonacci scales, including D3)
- [ ] Implement prompt construction: serialise SystemContext + Ticket for LLM context
- [ ] Implement structured output parsing + Zod validation of `GapAnalysisResultSchema`
- [ ] Implement quality gates: actionability check, confidence threshold (< 0.7 → flag for review)
- [ ] Implement D3 floor enforcement: `max(ticket D3, projectConfig.d3QualityFloor)`
- [ ] Write Tier 3 boundary tests with mock LLM responses from `__fixtures__/`

**Exit criteria:** Given a baseline and ticket, produces a schema-valid `GapAnalysisResult` with five ISV factor scores.

---

## QG-3 — Gap Analyzer Real-World Gate

**Blocker for:** M5 (ISV Calculation Pipeline)

- [ ] Real-world test: invoke Gap Analyzer with ISV Engine repo baseline + one UNICEF ticket
- [ ] Assert output passes `GapAnalysisResultSchema.parse()`
- [ ] Assert all five ISV scoring fields (A1, A2, B1, C1, D3) have valid Fibonacci values
- [ ] Assert confidence score is ≥ 0.7 for a well-described ticket
- [ ] Test named `gap-analyzer.realworld.test.ts` in `packages/services/`

**Pass criteria:** LLM produces schema-valid, structurally reasonable ISV factor scores for a real ticket.

---

## R1 — Domain Model Review (Architectural Checkpoint)

**Goal:** Before assembling the full pipeline, verify all domain types are used consistently across services.

- [ ] Audit: every service input/output uses `@isv/domain` schemas — no ad-hoc types
- [ ] Audit: all `Result<T>` returns use `createResultSchema()` at service boundaries
- [ ] Audit: no domain imports from `@isv/clients` (dependency rule violation)
- [ ] Audit: no `@isv/clients` imports from `@isv/services` that bypass domain types
- [ ] Verify all Zod schemas have round-trip tests (parse → infer → re-parse)
- [ ] Verify `IsvScoringSchema` D3 field is consumed by Gap Analyzer and propagated to `IsvFactors`
- [ ] Verify `ProjectConfigSchema.d3QualityFloor` path: config → Gap Analyzer → IsvFactors.D3
- [ ] Verify C2 derivation path: HealthScores → Valuation service → RepositoryBaseline.c2State → SystemBaseline.effectiveC2 → IsvFactors.C2

**Pass criteria:** Clean dependency graph, no type leaks, D3 and C2 data paths are traceable end-to-end.

---

## M5 — ISV Calculation Pipeline (Use Case 2)

**Goal:** End-to-end orchestration: single ticket → final `IsvResult`.

- [ ] Implement pipeline: ticket ID → Jira client → ticket
- [ ] Implement pipeline: repos → Git client checkout → Status Quo Miner → CodeHealthReport[]
- [ ] Implement pipeline: repos → Git client checkout → Architecture Scanner → SystemContext[]
- [ ] Implement pipeline: assemble `SystemBaseline` from per-repo outputs
- [ ] Implement pipeline: derive C2 via Valuation service
- [ ] Implement pipeline: invoke Gap Analyzer → `GapAnalysisResult`
- [ ] Implement pipeline: assemble `IsvFactors` (A1-C1, D3 from Gap Analyzer; C2 from Valuation)
- [ ] Implement pipeline: invoke Valuation service → `IsvResult`
- [ ] Write Tier 3 boundary test: mock all services, assert pipeline orchestration
- [ ] Write error handling: propagate `Result<T>` failures cleanly

**Exit criteria:** `pipeline.run(ticketId, config) → IsvResult` compiles and passes boundary tests.

---

## QG-4 — Single-Ticket End-to-End Gate

**Blocker for:** M7 (Historical Calibration Pipeline)

- [ ] Real-world test: run ISV Calculation Pipeline for one UNICEF ticket against the ISV Engine repo
- [ ] Assert final `IsvResult` passes `IsvResultSchema.parse()`
- [ ] Assert `isvScore > 0` and `breakdown` fields are consistent with factors
- [ ] Assert formula: `isvScore === poValue × archFactor × qualityMultiplier`
- [ ] Test named `isv-calculation.realworld.test.ts` in `packages/pipelines/`

**Pass criteria:** A real ticket produces a valid, non-trivial ISV score through the complete pipeline.

---

## M6 — Calibration Service

**Goal:** Time-entry attribution, cluster assembly, per-cluster ISV + metrics population.

- [ ] Implement ticket clustering: parent + subtasks from Jira hierarchy
- [ ] Implement T0 derivation: first Git commit or Jira status transition per cluster
- [ ] Implement time-entry attribution (5 strategies from concept doc: direct, cluster, multi-ID split, threshold, no-ID)
- [ ] Implement `AttributedTimeEntry` production with audit trail
- [ ] Implement Git change metrics aggregation: LOC, entropy, complexity delta → `GitChanges`
- [ ] Implement `ShipUnitCluster` assembly: ISV score + time + git changes
- [ ] Implement Data Quality Score (DQS): `(Matched + KBV) / Total`
- [ ] Implement Ship Rate regression: ISV vs. hours with `simple-statistics`
- [ ] Write Tier 3 boundary tests with fixture-backed clusters

**Exit criteria:** Given tickets + time entries + git data, produces `ShipUnitCluster[]` and `CalibrationResult`.

---

## M7 — Historical Calibration Pipeline (Use Case 1)

**Goal:** Batch run: all historical clusters → `CalibrationResult` with R² and DQS.

- [ ] Implement pipeline: load all tickets from Jira client
- [ ] Implement pipeline: cluster tickets → derive T0 per cluster
- [ ] Implement pipeline: for each cluster: Git checkout at T0 → Fact Finder → Gap Analyzer → Valuation
- [ ] Implement pipeline: for each cluster: time attribution → Git change metrics
- [ ] Implement pipeline: assemble `ShipUnitCluster[]`
- [ ] Implement pipeline: run calibration → `CalibrationResult`
- [ ] Write Tier 3 boundary test: mock services, assert pipeline orchestration
- [ ] Write error handling: skip clusters with insufficient data, log warnings

**Exit criteria:** `pipeline.run(config) → CalibrationResult` compiles and passes boundary tests.

---

## QG-5 — Calibration Statistical Gate

**Blocker for:** M8 (Interfaces)

- [ ] Real-world test: batch calibration on UNICEF dataset
- [ ] Assert `CalibrationResult` passes `CalibrationResultSchema.parse()`
- [ ] Assert `rSquared > 0.7` (target correlation)
- [ ] Assert `dataQualityScore > 0.85` (DQS threshold)
- [ ] Assert `shipRateHoursPerIsv > 0` (positive ship rate)
- [ ] Assert `sampleSize` matches expected cluster count
- [ ] Test named `historical-calibration.realworld.test.ts` in `packages/pipelines/`

**Pass criteria:** Empirical correlation between ISV scores and actual hours exceeds the documented R² > 0.7 target.

---

## R2 — Architecture Hygiene Review (Final Checkpoint)

**Goal:** Before exposing interfaces, ensure the full codebase is clean and consistent.

- [ ] Dependency audit: `pnpm ls --depth 0` per package — no phantom or circular dependencies
- [ ] Layer rule audit: interfaces → pipelines → services → clients → domain (no shortcuts)
- [ ] Every folder has a README.md with Purpose, Contents, How to use
- [ ] All services are stateless: input in, output out, no side effects beyond I/O
- [ ] All external boundaries validate with Zod (LLM responses, file parsing, config)
- [ ] Internal service-to-service calls trust already-validated data (no redundant re-validation)
- [ ] Error handling: all service boundaries return `Result<T>`, no raw exceptions
- [ ] No client-specific names in committed docs or fixtures
- [ ] Test coverage: every service has Tier 2 adapter tests and Tier 3 boundary tests
- [ ] Real-world tests: all QG tests pass in a single `pnpm test:realworld` run

**Pass criteria:** Clean architecture, consistent patterns, all tests green.

---

## M8 — Interfaces (CLI + API)

**Goal:** Delivery layer making both use cases accessible.

- [ ] Create `packages/interfaces/cli/` workspace package
- [ ] Implement CLI command: `isv calculate <ticketId>` → ISV Calculation Pipeline
- [ ] Implement CLI command: `isv calibrate` → Historical Calibration Pipeline
- [ ] Implement CLI configuration loading (project config, client configs)
- [ ] Create `packages/interfaces/api/` workspace package (if needed)
- [ ] Implement REST endpoint or MCP server tool for ISV calculation
- [ ] Write integration tests for CLI commands
- [ ] Update root README with usage instructions

**Exit criteria:** Both use cases are executable from the command line with real data.

---

## Decision Log

Decisions made during roadmap execution that affect future milestones.

| Date | Decision | Context |
| --- | --- | --- |
| 2026-03-04 | Fibonacci integer scales for all ISV factors | Harmonised across concept docs + domain schemas |
| 2026-03-04 | C2 derived by Valuation service, not pipeline | Penalty model: HealthScores → weighted sum → C2 ∈ {1,2,3} |
| 2026-03-04 | D3 assessed by Gap Analyzer, floor from ProjectConfig | Defaults to 1; elevated by ticket signals or project config |
| 2026-03-04 | Static analysis tools: scc + jscpd + knip | cloc dropped — scc covers same metrics with added complexity data |
| 2026-03-04 | LLM provider: CLI-only MVP | GitHub Copilot CLI only; CI-compatible provider deferred |
| 2026-03-04 | Multi-repo C2: max across repos | Any single toxic repo poisons the system intervention |
