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

Current top-level structure:
- `docs/`
  - `concept/`
  - `architecture/`

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

## Technology status

There is currently no committed runtime/application tech stack yet.

Until a stack is chosen:
- prefer plain Markdown for documentation,
- avoid introducing build tools or frameworks without prior alignment,
- document any proposed tech decision in `docs/architecture/`.

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
