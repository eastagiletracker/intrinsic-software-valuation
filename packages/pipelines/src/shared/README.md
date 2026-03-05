# Shared Pipeline Utilities

## Purpose

Generic utility modules shared across pipeline implementations (ISV Calculation and Historical Calibration).

## Contents

| File | Description |
| --- | --- |
| `retry.ts` | `retryAsync<T>` — generic async retry with exponential backoff |
| `checkpoint.ts` | `CheckpointWriter` / `CheckpointReader` — JSONL-based checkpoint persistence |

## retry.ts

Generic retry utility for wrapping async operations that may fail transiently (e.g. LLM calls, Git operations).

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
- `delay` — Injectable delay function (for testing)

## checkpoint.ts

JSONL-based checkpoint writer and reader for pipeline crash recovery.

```typescript
import { CheckpointWriter, CheckpointReader } from "./checkpoint.js";

const writer = new CheckpointWriter("path/to/progress.jsonl");
await writer.append("CLUSTER-1", shipUnitCluster);
await writer.appendSkipped("CLUSTER-2", "Low confidence");

const checkpoint = await CheckpointReader.load("path/to/progress.jsonl");
// checkpoint is Map<string, CheckpointEntry>
```
