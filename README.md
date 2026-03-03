# Intrinsic Software Valuation

A documentation-first project for defining and evolving an Intrinsic Software Valuation (ISV) engine.

## Purpose

This repository captures the conceptual model, methods, and evolution path for estimating the intrinsic value of software systems.

The goal is to create a transparent, explainable valuation framework that can be:
- understood by technical and non-technical stakeholders,
- extended in small, documented steps,
- validated against historical and practical scenarios.

## Overview

### Documentation (`docs/`)

- `docs/concept/` — core ISV concepts and method chapters
- `docs/architecture/` — architecture decisions and high-level design

The `concept` series currently includes:
- Big Picture
- Architecture Scanner
- Status Quo Miner
- Gap Analyzer
- Valuation
- Historical Calibration
- Glossary

### Source Code (`packages/`)

pnpm workspace monorepo with one package per architecture layer:

- `packages/domain/` (`@isv/domain`) — Zod schemas, shared types (zero internal dependencies)
- `packages/clients/` (`@isv/clients`) — external system adapters (Jira, LLM, Git, time tracking, static analysis)
- `packages/services/` (`@isv/services`) — business logic per ISV phase (stateless)
- `packages/pipelines/` (`@isv/pipelines`) — use-case orchestration (standalone ISV calculation, historical calibration)
- `packages/interfaces/` — delivery mechanisms (CLI, REST API / MCP server) — added as separate packages later

For architectural rationale, see `docs/architecture/architecture.md`. For tech stack details, see `docs/architecture/techstack.md`.

### Data (`data/`)

Local, gitignored directory for time tracking exports and temporary pipeline artifacts.

## Usage

Use this repository as a reference and collaboration space for ISV method development.

Typical usage patterns:
- Read the conceptual chapters in `docs/concept/` from `00` upward.
- Discuss assumptions, definitions, and scoring logic via pull requests.
- Add or refine chapters and supporting docs incrementally.

### How to contribute new content

1. Find the target folder (or create a new one).
2. Ensure the folder has a `README.md` with:
   - folder purpose,
   - content overview,
   - navigation hints.
3. Add or update documents in small, reviewable changes.
4. Follow collaboration rules in `CONTRIBUTING.md`.

## Tech Stack

TypeScript, Node.js 24 LTS, pnpm workspaces. Zod for domain schemas. See `docs/architecture/techstack.md` for the full decision record.

## Getting Started

```bash
pnpm install      # install dependencies and link workspace packages
pnpm check        # type-check all packages (tsc --build)
pnpm test         # run tests across all packages
```

For conventions and contribution workflow, see:
- `CONTRIBUTING.md`
- `AGENTS.md`
