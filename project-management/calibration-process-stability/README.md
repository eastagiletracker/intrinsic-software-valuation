# Calibration Process Stability

Project management artifacts for making the historical calibration pipeline resilient, resumable, and observable — ensuring it runs reliably from ~100 clusters today to thousands in future phases.

## Contents

- [requirements.md](requirements.md) — Phase 1 user story: retry, checkpoint/resume, progress reporting, CLI wiring
- [phase-2-requirements.md](phase-2-requirements.md) — Phase 2 user story: parallel queue, SQLite run store, LLM semaphore, `isv init`

## Phases Overview

| Phase | Focus | Status |
| --- | --- | --- |
| **Phase 1** — Resilience & Observability | Retry, checkpoint, progress, CLI wiring | requirements written |
| **Phase 2** — Parallelism & Persistence | `p-queue`, `node:sqlite` run store, LLM semaphore, `isv init` | requirements written |
| **Phase 3** — Operational Maturity | Structured logging, metrics, resource monitoring | planned |
