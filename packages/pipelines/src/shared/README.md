# Shared Pipeline Utilities

## Purpose

Generic utility modules shared across pipeline implementations (ISV Calculation and Historical Calibration).

## Contents

| File | Description |
| --- | --- |
| `retry.ts` | `retryAsync<T>` — generic async retry with exponential backoff (backed by `p-retry`) |
| `checkpoint.ts` | `CheckpointWriter` / `CheckpointReader` — JSONL-based checkpoint persistence |
| `llm-semaphore.ts` | `createLlmGate` — LLM concurrency gate (backed by `p-limit`) |
| `run-store.port.ts` | `RunStore` interface — port for run/cluster state persistence |
| `sqlite-run-store.ts` | `SqliteRunStore` — `node:sqlite` implementation of `RunStore` |

## retry.ts

Generic retry utility for wrapping async operations that may fail transiently (e.g. LLM calls, Git operations).
Backed by `p-retry` (Phase 2 replacement for the hand-rolled implementation).

```typescript
import { retryAsync } from "./retry.js";

const result = await retryAsync(
  () => someAsyncOperation(),
  { maxRetries: 3, baseDelayMs: 1000, backoffFactor: 2 },
);
```

Options:
- `maxRetries` — Maximum retry attempts (default: 3)
- `baseDelayMs` — Initial delay in ms (default: 1000)
- `backoffFactor` — Multiplier per attempt (default: 2)
- `shouldRetry` — Optional predicate to filter retryable errors
- `onFailedAttempt` — Optional callback on each failed attempt
- `delay` — Injectable delay function (for testing)

## checkpoint.ts

JSONL-based checkpoint writer and reader for pipeline crash recovery.
Kept as an optional human-readable export alongside the `RunStore` (Phase 2).

```typescript
import { CheckpointWriter, CheckpointReader } from "./checkpoint.js";

const writer = new CheckpointWriter("path/to/progress.jsonl");
await writer.append("CLUSTER-1", shipUnitCluster);
await writer.appendSkipped("CLUSTER-2", "Low confidence");

const checkpoint = await CheckpointReader.load("path/to/progress.jsonl");
// checkpoint is Map<string, CheckpointEntry>
```

## llm-semaphore.ts

LLM concurrency gate that limits simultaneous LLM API calls across all cluster workers.
Independent of the cluster worker count.

```typescript
import { createLlmGate } from "./llm-semaphore.js";

const gate = createLlmGate(2); // max 2 concurrent LLM calls
const result = await gate(() => llmClient.prompt(query));
```

## run-store.port.ts

Port interface for calibration run and cluster state persistence.
Defines `RunStore`, `RunRecord`, `ClusterRecord`, `RunStatus`, `ClusterStatus`.

## sqlite-run-store.ts

`node:sqlite` implementation of `RunStore`. Creates a SQLite database per calibration run
at `data/<projectSlug>/calibration-runs/<runId>/store.db`. Uses WAL mode for safe concurrent reads.
