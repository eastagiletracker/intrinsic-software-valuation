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

All CLI commands are run from the monorepo root via `pnpm cli`. The `--` separator between `pnpm cli` and the command flags is required.

```bash
pnpm cli -- --help
```

### Commands

#### `init` — Initialise a project

Creates `data/<slug>/` with directory structure and template config.

```bash
pnpm cli -- init --project <slug>
pnpm cli -- init --project <slug> --warmup   # also build SQLite data layer
```

| Option | Description |
| ------ | ----------- |
| `--project <slug>` | Project slug (required) |
| `--warmup` | Build SQLite data layer after init |

#### `calculate` — ISV for a single ticket

```bash
pnpm cli -- calculate <ticketId> --project <slug>
```

| Option | Description |
| ------ | ----------- |
| `<ticketId>` | Ticket ID to calculate ISV for (required, positional) |
| `--project <slug>` | Project slug (required) |
| `--json` | Suppress stderr progress; stdout JSON only |

#### `calibrate` — Historical calibration

```bash
pnpm cli -- calibrate --project <slug> [options]
```

| Option | Description |
| ------ | ----------- |
| `--project <slug>` | Project slug (required) |
| `--from <YYYY-MM>` | Start of calibration period (default: 18 months before end) |
| `--to <YYYY-MM>` | End of calibration period (default: current month) |
| `--run-id <id>` | Resume a specific run |
| `--concurrency <n>` | Cluster concurrency (default: 6) |
| `--llm-concurrency <n>` | LLM concurrency (default: 2) |
| `--recompute-regression [<path>]` | Skip fact-finding, reuse clusters from a previous report. Auto-detects latest report if path omitted. |
| `--dry-run` | Check cache coverage without processing. Reports how many clusters are cached vs would need full reprocessing. |
| `--d3-quality-floor <1\|2\|3>` | D3 quality floor override |
| `--min-confidence <number>` | Minimum cluster confidence to include |
| `--status` | Show calibration run status instead of running |
| `--json` | Suppress stderr progress; stdout JSON only |

**Re-run strategies:**

- **`--recompute-regression`** — Reads a previous output file, skips all fact-finding (git, LLM), re-runs only regression + executive summary. Completes in seconds.
- **`--dry-run`** — Probes caches for every cluster and reports hit/miss counts. Use this to verify cache coverage before committing to a full re-run.
- **Full re-run** — With warm caches, the pipeline skips git worktree checkouts for clusters where all cached results (SQM, architecture scanner, gap analyzer) are present. Progress output shows `cache-hit` vs `completed` per cluster.

#### `calibrate --status` — Run status

```bash
pnpm cli -- calibrate --status --project <slug>
pnpm cli -- calibrate --status --project <slug> --run-id <id>
```

#### `cache-purge` — Delete cached data

```bash
pnpm cli -- cache-purge --project <slug>
```

Deletes cached architecture scanner, status quo miner, and gap analyzer data for a project.

### Global options

| Option | Description |
| ------ | ----------- |
| `--help` | Show help (use with a command for command-specific help) |
| `--json` | Suppress stderr progress output (stdout JSON only) |

See `packages/interfaces/cli/README.md` for additional details.

For conventions and contribution workflow, see:

- `CONTRIBUTING.md`
- `AGENTS.md`
