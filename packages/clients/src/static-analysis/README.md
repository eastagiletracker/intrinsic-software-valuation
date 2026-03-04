# Static Analysis

Static analysis client adapter wrapping CLI tools for code metrics collection.

## Purpose

Provides a `StaticAnalysisPort` (low-level, per-tool interface) and a `StaticAnalysisClient` (high-level orchestrator) that abstract external CLI analysis tools. The Status Quo Miner service consumes `StaticAnalysisClient` to produce `StructuralFacts` and `HealthScores` for each repository without knowing about individual tools.

## Tools

| Tool | Metrics | Used For |
| --- | --- | --- |
| `scc` | Lines of code, file count, avg cyclomatic complexity, god classes (>1000 LOC) | Structural facts + complexity health scores |
| `jscpd` | Duplication percentage | Health scores (complexity dimension) |
| `knip` | Dead/unused code files | Health scores (test health / system rot dimension) |

`cloc` is not used — `scc` covers the same volume metrics with lower overhead and also provides complexity data.

## Contents

| File | Description |
| --- | --- |
| `port.ts` | `StaticAnalysisPort` — per-tool interface (`scc`, `jscpd`, `knip`) |
| `client.ts` | `StaticAnalysisClient` — high-level orchestrator returning domain types |
| `scc-adapter.ts` | `scc` CLI wrapper — parses JSON output → `SccResult` |
| `jscpd-adapter.ts` | `jscpd` CLI wrapper — parses JSON reporter → `JscpdResult` |
| `knip-adapter.ts` | `knip` CLI wrapper — parses JSON output → `KnipResult` |
| `cli-static-analysis.adapter.ts` | `CliStaticAnalysisAdapter` implementing `StaticAnalysisPort` |
| `factory.ts` | `createStaticAnalysisClient()` factory + mapping helpers |
| `__fixtures__/` | Sample JSON outputs for each tool (with provenance headers) |
| `index.ts` | Public re-exports |

## How to use

```typescript
import { createStaticAnalysisClient } from "@isv/clients";

const client = createStaticAnalysisClient();
const { structuralFacts, healthScores } = await client.analyze("/path/to/repo");
```

Entry point and architecture-surface metrics (controllers, views) are collected separately by the Status Quo Miner using file-system pattern matching, not by this client.
