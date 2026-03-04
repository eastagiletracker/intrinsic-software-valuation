# AGENTS

Guidance for AI and automation agents working in this repository.

## Priority of instructions

1. User task/request
2. Repository instructions in this file
3. `CONTRIBUTING.md`
4. `README.md`

If instructions conflict, follow the higher-priority source and keep changes minimal.

## Agent responsibilities

- Keep edits scoped to the requested task.
- Preserve existing structure and naming conventions.
- Prefer documentation improvements over speculative implementation.
- Do not introduce new tooling or frameworks unless explicitly requested.

## Required checks before adding content

- Verify target folder has a `README.md`.
- If missing, add/update the folder `README.md` with purpose + content overview.
- Keep cross-references current when creating or moving files.
- When changing folder contents, verify affected `README.md` files are up to date and remove stale documentation.

## Change quality rules

- Use concise, precise wording.
- Avoid broad refactors for small tasks.
- Keep terminology aligned with the glossary and concept docs.
- Make assumptions explicit when information is incomplete.
- **Never name specific clients or customers in globally committed `README.md` or documentation files.** Client-specific names must stay inside gitignored project subfolders (e.g. `data/<client>/`).

## Testing rules

Follow the four-tier strategy in [`docs/qa-strategy.md`](docs/qa-strategy.md).

Key agent rules:
- When adding a new adapter: create `__fixtures__/` with provenance header, write Tier 2 `*.adapter.test.ts`.
- When adding a new service or pipeline: write Tier 3 `*.boundary.test.ts`; mock return values must reference a fixture file.
- Never invent mock data not backed by a committed fixture or domain schema.
- Never place real client names, ticket IDs, or person names in committed fixtures.

## Handoff expectation

After making changes, provide a short summary of:
- what was changed,
- where it was changed,
- any follow-up gaps that still need human decisions.

Most collaboration, structure, and contribution policy lives in `CONTRIBUTING.md` and `README.md`; this file intentionally contains only additional agent-specific guidance.
