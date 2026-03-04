# Status Quo Miner Service

## Purpose

Phase 1 (quantitative) of the Fact Finder: collects deterministic code health metrics from checked-out repositories using static analysis tools (scc, jscpd, knip) and Git history. No AI involved.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `StatusQuoMinerPort` — service interface |
| `service.ts` | Implementation: metric collection + entry-point detection + hotspots |
| `factory.ts` | `createStatusQuoMiner(staticAnalysis, gitClient?)` factory |
| `index.ts` | Public re-exports |

## How to use

```typescript
import { createStatusQuoMiner } from "@isv/services";
import { createStaticAnalysisClient } from "@isv/clients";

const staticAnalysis = createStaticAnalysisClient();
const miner = createStatusQuoMiner(staticAnalysis);

const result = await miner.mine(workingTrees, "2025-01-01T00:00:00.000Z");
if (result.success) {
  result.data; // CodeHealthReport[]
}
```

## Dependencies injected

- `StaticAnalysisClient` — for code metrics (scc, jscpd, knip)
- `GitClient` (optional) — for hotspot extraction via `logStats()`
