# Gap Analyzer Service

## Purpose

Phase 2 of the ISV Engine: compares a ticket (target state) with the system baseline (current state) using an LLM to produce structured ISV factor scores (A1, A2, B1, C1, D3). C2 is derived separately by the Valuation service.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `GapAnalyzerPort` — service interface |
| `service.ts` | Implementation: prompt construction + LLM invocation + Zod validation + D3 floor |
| `factory.ts` | `createGapAnalyzer()` factory |
| `index.ts` | Public re-exports |

## How to use

```typescript
import { createGapAnalyzer } from "@isv/services";
import { createLlmClient } from "@isv/clients";

const analyzer = createGapAnalyzer();
const llm = createLlmClient({ provider: "github-copilot-cli" });

const result = await analyzer.analyze(baseline, ticket, projectConfig, llm);
if (result.success) {
  result.data; // GapAnalysisResult with ISV factor scores
}
```

## Dependencies injected

- `LlmClient` — for prompt-based gap analysis
- `SystemBaseline` — from Fact Finder (phase 1)
- `Ticket` — from Jira client
- `ProjectConfig` — for D3 quality floor enforcement
