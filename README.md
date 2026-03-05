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
- `packages/interfaces/` — delivery mechanisms:
  - `packages/interfaces/cli/` (`@isv/cli`) — command-line interface
  - `packages/interfaces/web/` (`@isv/web`) — browser-based UI

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

### Prerequisites

The ISV Engine requires several tools to be installed locally. Run the setup check to verify everything at once:

```bash
pnpm run check:setup     # or: ./scripts/check-setup.sh
```

#### Core toolchain

| Tool | Minimum version | Install |
| ---- | --------------- | ------- |
| **Node.js** | ≥ 24 LTS | `nvm install 24` or [nodejs.org](https://nodejs.org) |
| **pnpm** | ≥ 9 | `corepack enable` (bundled with Node.js) |
| **Git** | any recent | `brew install git` or [git-scm.com](https://git-scm.com) |

> **Note:** Node 24 ships with a built-in `node:sqlite` module. The calibration pipeline uses it to persist run state — no external SQLite installation required.

#### GitHub Copilot CLI (LLM adapter)

The Architecture Scanner and Gap Analyzer use GitHub Copilot as the LLM backend. The adapter invokes `gh copilot` on the command line.

1. **Install the GitHub CLI:**

   ```bash
   brew install gh
   ```

2. **Authenticate:**

   ```bash
   gh auth login          # follow the browser-based flow
   gh auth status         # verify: "Logged in to github.com"
   ```

3. **Install the Copilot extension:**

   ```bash
   gh extension install github/gh-copilot
   ```

4. **Verify:**

   ```bash
   gh copilot -p "Say hello" -s      # should print a response
   ```

> **Note:** A GitHub Copilot licence (Individual, Business, or Enterprise) is required. The adapter uses `gh copilot -p "<prompt>" -s` for non-interactive, script-friendly output.

#### Static analysis tools

The Status Quo Miner shells out to three CLI tools for code health metrics:

| Tool | Purpose | Install |
| ---- | ------- | ------- |
| **scc** | Lines of code, file count, cyclomatic complexity | `brew install scc` |
| **jscpd** | Copy/paste detection (duplication %) | `npm install -g jscpd` |
| **knip** | Dead code / unused export detection | `npm install -g knip` |

### Install & verify

```bash
pnpm install      # install dependencies and link workspace packages
pnpm run check    # type-check all packages (tsc --build)
pnpm test         # run unit + boundary tests (Tiers 1–3)
```

### Initialise a project

Before running any pipeline command you need a project workspace under `data/`:

```bash
pnpm cli -- init --project <slug>   # creates data/<slug>/ with template config
```

This creates the directory structure (`calibration-runs/`, `git/repos/`, `git/work/`) and a `project-config.json` with `CHANGE-ME` placeholders. Open the config and fill in Jira, Git, LLM, and time-tracking settings for your project.

See `packages/interfaces/cli/README.md` for the full flag reference.

## Web UI Usage

Start the web UI development server from the repository root:

```bash
pnpm run dev:web
```

This command runs `@isv/web` via workspace filtering.

## CLI Usage

All CLI commands are run from the monorepo root via `pnpm cli`:

```bash
# Show help
pnpm cli -- --help

# Initialise a new project (creates data/<slug>/ and template config)
pnpm cli -- init --project my-project

# Calculate ISV for a single ticket (Use Case 2)
pnpm cli -- calculate PROJ-123 --project my-project

# Run historical calibration (Use Case 1)
pnpm cli -- calibrate --project my-project

# Calibrate with period and concurrency options
pnpm cli -- calibrate --project my-project --from 2025-01 --to 2026-02 --concurrency 5

# Check calibration run status
pnpm cli -- calibrate --status --project my-project
```

The `--` separator between `pnpm cli` and the command flags is required.

See `packages/interfaces/cli/README.md` for the full flag reference.

For conventions and contribution workflow, see:

- `CONTRIBUTING.md`
- `AGENTS.md`
