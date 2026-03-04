# ISV Calculation Pipeline

## Purpose

Use Case 2: end-to-end orchestration from a single ticket ID to a final ISV score. Coordinates all services in the correct order: ticket retrieval → fact finding → gap analysis → valuation.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `IsvCalculationPipelinePort` — pipeline interface |
| `pipeline.ts` | Orchestration implementation + factory |
| `index.ts` | Public re-exports |

## How to use

```typescript
import { createIsvCalculationPipeline } from "@isv/pipelines";

const pipeline = createIsvCalculationPipeline({
  ticketClient,
  gitClient,
  llmClient,
  statusQuoMiner,
  architectureScanner,
  gapAnalyzer,
  valuation,
});

const result = await pipeline.run("PROJ-123", { d3QualityFloor: 1 });
if (result.success) {
  console.log(result.data.isvScore);
}
```

## Pipeline Steps

1. Fetch ticket from Jira client
2. Checkout repositories via Git client
3. Status Quo Miner → CodeHealthReport[]
4. Architecture Scanner → SystemContext[]
5. Derive per-repo C2 via Valuation service
6. Assemble SystemBaseline
7. Gap Analyzer → GapAnalysisResult
8. Assemble IsvFactors (A1-C1, D3 from Gap Analyzer; C2 from Valuation)
9. Valuation service → IsvResult
