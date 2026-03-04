# Contributing

Thank you for contributing to this project.

This repository is currently documentation-first. The main focus is clarity, structure, and an evolvable valuation model.

## Scope of contributions

Contributions are welcome for:
- conceptual improvements,
- terminology clarifications,
- method refinements,
- structural improvements to documentation.

## Repository structure

Top-level layout:

- `docs/` — project documentation
  - `concept/` — ISV method chapters and glossary
  - `architecture/` — architecture decisions and high-level design
- `packages/` — pnpm workspace monorepo (one package per architecture layer)
  - `domain/` (`@isv/domain`) — Zod schemas, shared types
  - `clients/` (`@isv/clients`) — external system adapters (Jira, LLM, Git, time tracking, static analysis)
  - `services/` (`@isv/services`) — business logic per ISV phase
  - `pipelines/` (`@isv/pipelines`) — use-case orchestration
  - `interfaces/` — delivery mechanisms (CLI, API) — added as separate packages later
- `data/` — local, gitignored data files (time tracking exports)

### Source code conventions

- Dependencies flow inward: `interfaces/` → `pipelines/` → `services/` → `clients/` → external. All layers depend on `domain/`.
- **Dependency rule is enforced by pnpm workspaces** — each package declares its internal dependencies explicitly in `package.json`.
- `@isv/domain` has zero dependencies on other packages.
- `interfaces/` never calls `services/` or `clients/` directly — always through a pipeline.
- `pipelines/` never calls `clients/` directly — always through a service.
- Services are stateless: input in, output out.
- Domain types are defined as Zod schemas; TypeScript types are inferred via `z.infer<>`.
- Each new subfolder requires its own `README.md`.

As the project grows, keep structure explicit and easy to navigate.

## Folder README convention (required)

Every folder in the repository should contain a `README.md`.

Each folder `README.md` must include:
- **Purpose**: why this folder exists,
- **Contents overview**: what files/subfolders are inside,
- **How to use**: recommended reading or editing flow.

When creating a new folder, add its `README.md` in the same change.

## Documentation maintenance (required)

Documentation and `README.md` files must stay current and clean.

For every change that creates, removes, moves, or significantly updates folder content:
- verify whether affected `README.md` files are still accurate,
- update purpose/content overview/usage notes when needed,
- remove stale references and outdated descriptions.

Treat `README.md` updates as part of the same change, not as a later follow-up.

## Technology stack

- **Language**: TypeScript (ESM-only)
- **Runtime**: Node.js 24 LTS
- **Package manager**: pnpm (workspace monorepo)
- **Schemas**: Zod (source of truth for domain types)
- **Build**: `tsc` for type checking, `tsx` for execution — no bundling in MVP

For the full decision record, see `docs/architecture/techstack.md`.
For architecture rationale, see `docs/architecture/architecture.md`.

## Testing

This project follows a four-tier testing strategy defined in [`docs/qa-strategy.md`](docs/qa-strategy.md).

Quick reference — file naming encodes the tier:

| Pattern | Tier | What it covers |
|---|---|---|
| `*.test.ts` | 1 — Unit | Single function / schema / class |
| `*.adapter.test.ts` | 2 — Adapter fixture | Adapter against committed sanitized fixture |
| `*.boundary.test.ts` | 3 — Component boundary | Full component, all adjacent layers mocked |
| `*.realworld.test.ts` | 4 — Realworld | Real gitignored data, auto-skipped in CI |

Key rules:
- Mock data in boundary tests must be **derived from committed fixtures** — never invented.
- Every fixture file must document its **source system and anonymisation steps**.
- `pnpm test` runs Tiers 1–3. `pnpm test:realworld` runs Tier 4.

See [`docs/qa-strategy.md`](docs/qa-strategy.md) for full rules and checklists.

## Content style guidelines

- Keep terms consistent with the glossary.
- Prefer small, focused PRs.
- Use clear headings and concise language.
- Make assumptions explicit.
- Avoid mixing unrelated topics in one file.

## Pull request guidance

- Explain **what** changed and **why**.
- Link related discussions/issues if available.
- Keep changes reviewable (small, scoped commits/PRs).
- Update folder `README.md` files when structure changes.

## Decision records (lightweight)

For meaningful structural or method decisions, add a short decision note in `docs/architecture/` with:
- context,
- considered options,
- chosen direction,
- rationale.
