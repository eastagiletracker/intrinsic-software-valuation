# Architecture Scanner Service

## Purpose

Phase 1 (qualitative) of the Fact Finder: uses an LLM to extract structured architecture information (system archetype, tech stack, adapters, patterns, domain models) from a codebase. Produces a `SystemContext` validated against the domain schema.

## Sampling strategy

The scanner employs a **hybrid deep-sampling** approach to maximize architectural signal for the LLM:

1. **Deep directory tree** (4 levels, 5 KB cap) — gives the LLM a structural overview while excluding noise directories (`node_modules`, `dist`, `.git`, etc.).
2. **Key configuration files** — `pom.xml`, `package.json`, `build.gradle.kts`, `Dockerfile`, etc., read and included (up to 2 KB each).
3. **Dependency extraction** — Maven or npm dependencies listed explicitly so the LLM can identify SDK integrations.
4. **Targeted file discovery** — Files are classified into three categories using name/path patterns:
   - **Domain models** (up to 10): entity/model/type/schema files, CMS content beans
   - **Adapters** (up to 10): client/adapter/connector files in integration paths
   - **Entry points** (up to 5): controllers, resolvers, route handlers
5. **Import summary** — Unique import statements from targeted files, enabling SDK detection.
6. **Budget enforcement** — Total prompt capped at 30 KB with reverse-priority truncation.

All outputs are deterministically sorted to ensure reproducible results across runs.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `ArchitectureScannerPort` — service interface |
| `service.ts` | Implementation: deep directory sampling + targeted file discovery + LLM prompt + Zod validation |
| `cached-scanner.ts` | `CachedArchitectureScannerService` — caching decorator keyed by `(repositoryId, commitSha)` |
| `factory.ts` | `createArchitectureScanner()` factory (optionally wraps with cache) |
| `index.ts` | Public re-exports |
| `sample-directory.test.ts` | Tier 1 unit tests for `sampleDirectory()` |
| `architecture-scanner.boundary.test.ts` | Tier 3 boundary test with mocked LLM |
| `cached-scanner.test.ts` | Tier 1 unit tests for the caching decorator |
| `__fixtures__/` | Synthetic repo fixtures for testing (see `__fixtures__/README.md`) |

## How to use

```typescript
import { createArchitectureScanner } from "@isv/services";
import { createLlmClient } from "@isv/clients";

const scanner = createArchitectureScanner();
const llm = createLlmClient({ provider: "github-copilot-cli" });

const result = await scanner.scan("/path/to/repo", llm);
if (result.success) {
  result.data; // SystemContext
}
```

### With caching

```typescript
import { createArchitectureScanner } from "@isv/services";

const scanner = createArchitectureScanner({
  enabled: true,
  cacheDir: "data/my-project/cache",
});

// When commitSha is provided, results are cached per (repositoryId, commitSha)
const result = await scanner.scan("/path/to/repo", llm, "abc123def456");
```

## Dependencies injected

- `LlmClient` — for prompt-based architecture analysis
- `FileCache` / `buildCacheKey` (from `@isv/clients`) — for optional result caching
