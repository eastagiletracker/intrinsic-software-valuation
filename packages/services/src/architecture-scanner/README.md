# Architecture Scanner Service

## Purpose

Phase 1 (qualitative) of the Fact Finder: uses an LLM to extract structured architecture information (system archetype, tech stack, adapters, patterns, domain models) from a codebase. Produces a `SystemContext` validated against the domain schema.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `ArchitectureScannerPort` — service interface |
| `service.ts` | Implementation: directory sampling + LLM prompt + Zod validation |
| `factory.ts` | `createArchitectureScanner()` factory |
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

## Dependencies injected

- `LlmClient` — for prompt-based architecture analysis
