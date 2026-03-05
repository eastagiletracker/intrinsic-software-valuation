# ISV Calculation Pipeline

## Purpose

Use Case 2: end-to-end orchestration from a single ticket ID to a final ISV score. Coordinates all services in the correct order: ticket retrieval → fact finding → gap analysis → valuation.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `IsvCalculationPipelinePort` — pipeline interface |
| `pipeline.ts` | Orchestration implementation + factory |
| `enriched-result.ts` | `EnrichedIsvResult` type — enriched result carrying all intermediate outputs |
| `config-factory.ts` | `createIsvCalculationFromConfig()` — config-based pipeline factory for the web endpoint |
| `index.ts` | Public re-exports |

## How to use

### Dependency-injection factory (for tests and CLI)

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
  console.log(result.data.isvResult.isvScore);
}
```

### Config-based factory (for the web endpoint)

The config-based factory accepts a raw `project-config.json` object and internally
creates all required clients and services. The web package only needs to import
from `@isv/pipelines` — no direct dependency on `@isv/clients` or `@isv/services`.

```typescript
import { createIsvCalculationFromConfig } from "@isv/pipelines";

const factoryResult = await createIsvCalculationFromConfig(projectConfig);
if (!factoryResult.success) {
  // Handle INVALID_PROJECT_CONFIG or PIPELINE_INIT_FAILED
  console.error(factoryResult.error);
} else {
  const { pipeline, cleanup } = factoryResult.data;
  try {
    const result = await pipeline.run("PROJ-123", { d3QualityFloor: 1 });
    if (result.success) {
      console.log(result.data.isvResult.isvScore);
    }
  } finally {
    await cleanup(); // Release Git worktrees
  }
}
```

#### Required config sections

The factory validates that the project config contains the following top-level keys:

- `jira` — Jira/ticket client configuration (`dataFolderName`, `ticketPrefix`, `rawFormat`)
- `git` — Git client configuration (`repositories[]`, `dataFolderName`)
- `llm` — LLM client configuration (`provider`)

Optional:
- `pipeline` — Pipeline configuration (`d3QualityFloor`)
- `project` — Project metadata (`name`, `ticketPrefix`, `slug`)

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

The pipeline returns an `EnrichedIsvResult` containing the ticket, per-repository
intermediate outputs, gap analysis, final ISV result, and calibration context.
