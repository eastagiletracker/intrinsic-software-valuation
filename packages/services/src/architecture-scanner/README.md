# Architecture Scanner Service

## Purpose

Phase 1 (qualitative) of the Fact Finder: uses an LLM to extract structured architecture information (system archetype, tech stack, adapters, patterns, domain models) from a codebase. Produces a `SystemContext` validated against the domain schema.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `ArchitectureScannerPort` — service interface |
| `service.ts` | Implementation: directory sampling + LLM prompt + Zod validation |
| `cached-scanner.ts` | `CachedArchitectureScannerService` — caching decorator keyed by `(repositoryId, commitSha)` |
| `factory.ts` | `createArchitectureScanner()` factory (optionally wraps with cache) |
| `index.ts` | Public re-exports |

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
