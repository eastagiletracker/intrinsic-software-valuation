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
| `index.ts` | Public re-exports |

## How to use

1. Implement `StaticAnalysisPort` by wrapping the CLI tools via `execa`.
2. Wire the adapter into a `StaticAnalysisClient` factory (similar to the Git or LLM client patterns).
3. The Status Quo Miner service calls `client.analyze(directory)`.

Entry point and architecture-surface metrics (controllers, views) are collected separately by the Status Quo Miner using file-system pattern matching, not by this client.
