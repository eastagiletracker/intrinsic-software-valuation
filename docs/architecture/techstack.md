# Tech Stack Decision

## Context

The ISV Engine repository has been documentation-first with no committed tech stack. All concept documents define data contracts as TypeScript interfaces (`SystemContext`, `GapAnalysisResult`, `ShipUnitCluster`, `StandardizedTimeEntry`). The architecture document ([architecture.md](architecture.md)) listed the tech stack choice as open question #1.

This document records the chosen technology stack and the rationale behind it.

## Decision

| Concern | Choice |
| --- | --- |
| Language | TypeScript |
| Runtime | Node.js 24 LTS |
| Package Manager | pnpm |
| Schema / Validation | Zod (source of truth for domain types) |
| Module System | ESM-only (`"type": "module"`) |
| Build Strategy | `tsc` (type checking) + `tsx` (execution) — no bundling in MVP |
| Project Structure | pnpm workspace monorepo (`packages/`) |

## Rationale

### TypeScript

- **Concept alignment**: All data contracts in `docs/concept/` are already defined as TypeScript interfaces. They translate directly into `src/domain/` code with zero conversion overhead.
- **MCP ecosystem**: The Model Context Protocol SDK (`@modelcontextprotocol/sdk`) is TypeScript-first, matching the planned MCP server interface.
- **LLM integration**: OpenAI, Anthropic, and Vercel AI SDKs offer first-class TypeScript support with native JSON schema validation.
- **Type safety**: Strict compile-time checks enforce the layered dependency rule (`domain/` → `clients/` → `services/` → `pipelines/` → `interfaces/`).
- **JSON as native data type**: All inter-phase communication uses JSON — TypeScript handles this without serialization overhead.

### Node.js 24 LTS

- **Long-term support**: LTS releases receive security and stability updates for 30 months.
- **Modern APIs**: Native `fetch`, stable `node:test` runner, improved ESM support, and performance improvements over earlier versions.
- **Ecosystem compatibility**: Broad library support across the Node.js LTS line.

### pnpm

- **Strict dependency resolution**: Prevents phantom dependencies — each package only accesses explicitly declared dependencies.
- **Disk efficiency**: Content-addressable storage avoids duplicate packages across the workspace.
- **Monorepo support**: Native workspace protocol for managing the layered `packages/` structure.
- **Speed**: Faster installs compared to npm due to hard-linking and content-addressed storage.

### pnpm Workspace Monorepo

- **Architecture-enforced boundaries**: Each architecture layer is a separate workspace package (`@isv/domain`, `@isv/clients`, `@isv/services`, `@isv/pipelines`). Dependencies between layers are declared explicitly in each `package.json` — importing a package that is not declared as a dependency fails at install time.
- **Future-proof for interfaces**: CLI and API will be added as separate workspace packages under `packages/interfaces/` without restructuring existing code.
- **Selective operations**: `pnpm --filter @isv/services test` runs tests for only one package. Useful as the codebase grows.
- **Workspace protocol**: Internal dependencies use `"@isv/domain": "workspace:*"` — pnpm resolves these as symlinks, no publishing required.

### Zod as Source of Truth

- Domain types in `src/domain/` are defined as **Zod schemas**. TypeScript types are inferred via `z.infer<>` — single source of truth for both compile-time and runtime.
- All external boundaries (LLM responses, Jira API payloads, CLI input, file parsing) are validated through Zod `.parse()` or `.safeParse()`.
- Internal service-to-service communication within the pipeline can trust already-validated data and skip re-validation for performance.

### Build Strategy

- **MVP phase**: No build step. `tsx` executes TypeScript directly. `tsc --noEmit` for type checking. pnpm scripts for all commands.
- **Later phases**: If deployment to a server (REST API, MCP server) requires optimized bundles, `tsup` can be added as an escape-hatch without changing the source structure.
- **Next.js is explicitly excluded**: The ISV Engine has no UI layer. REST API and MCP server are thin JSON interfaces — lightweight frameworks (`fastify`, `hono`) are sufficient. A dashboard/UI, if ever needed, would be a separate project consuming the API.

## Key Libraries (Planned)

These are initial recommendations based on requirements from the concept documents. Final choices will be confirmed during implementation.

| Concern | Library | Purpose |
| --- | --- | --- |
| Schema & validation | `zod` | Source of truth for domain types; runtime validation at all external boundaries |
| LLM client | `openai`, `@anthropic-ai/sdk` | Architecture Scanner, Gap Analyzer |
| MCP server | `@modelcontextprotocol/sdk` | Expose ISV calculation as MCP tool |
| REST API | `fastify` or `hono` | HTTP interface for webhook-triggered ISV runs |
| CLI | `commander` or `oclif` | Command-line entry points for both use cases |
| Git operations | `execa` + `git` CLI | Repository checkout, worktree management, and log analysis |
| Jira client | `jira.js` or native `fetch` | Ticket retrieval and field updates |
| Static analysis | `scc`, `jscpd`, `knip` via `execa` | Volume, complexity, duplication, dead-code metrics for Status Quo Miner |
| Subprocess management | `execa` | Wrapping all CLI tools |
| Statistics | `simple-statistics` | Linear regression and R² for Historical Calibration |
| Testing | `vitest` | Unit and integration tests |

## Open Decisions

- **API framework**: `fastify` vs. `hono` for the REST API interface — to be decided when the API layer is implemented.
- **CLI framework**: `commander` vs. `oclif` — to be decided when the CLI interface is implemented.

## References

- [architecture.md](architecture.md) — layered folder structure, dependency rule, use-case analysis
- [ISV Concept Documents](../concept/README.md) — data contracts and phase definitions
