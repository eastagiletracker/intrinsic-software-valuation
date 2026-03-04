# Cache

Transparent, file-system-based JSON cache for client function results.

## Purpose

Avoids re-executing expensive I/O operations (XML parsing, Git CLI calls,
Excel parsing, external API calls) during repeated CLI invocations — especially
during Historical Calibration with hundreds of time-window snapshots.

Cache files double as a **human-readable audit trail**: they are valid JSON,
formatted with 2-space indentation, and stored in a deterministic directory
structure that can be inspected, diffed, or fed into analysis independently.

## Contents

| File | Description |
|---|---|
| `cache-config.schema.ts` | Zod schema for `CacheConfig` (`{ enabled, cacheDir }`) |
| `cache-key.ts` | Deterministic, filesystem-safe key generation from call metadata |
| `file-cache.ts` | `FileCache` class — JSON read/write, `getOrCompute()`, atomic writes |
| `index.ts` | Public barrel exports |

## How to use

### Configuration

```typescript
import type { CacheConfig } from "@isv/clients";

const cacheConfig: CacheConfig = {
  enabled: true,
  cacheDir: "data/my-project/.cache",
};
```

### With client factories

Each client factory (except LLM) accepts an optional `CacheConfig` parameter.
When `enabled` is `true`, the factory wraps the real client in a caching
decorator. When omitted or `false`, the factory returns the real client
unchanged (fully backward compatible).

```typescript
import { createTicketClient } from "@isv/clients";

// Without cache (default)
const client = await createTicketClient(config);

// With cache enabled
const cachedClient = await createTicketClient(config, {
  enabled: true,
  cacheDir: "data/my-project/.cache",
});
```

### Direct usage

```typescript
import { FileCache, buildCacheKey } from "@isv/clients";

const cache = new FileCache({ enabled: true, cacheDir: "data/project/.cache" });
const key = buildCacheKey("jira", "getTickets", { mode: "all" });

const result = await cache.getOrCompute(key, () => expensiveOperation());
```

## Cache path convention

```text
<cacheDir>/
  <client>/
    <method>/
      <paramHash>.json

# Example:
data/my-project/.cache/
├── jira/
│   └── getTickets/
│       └── ab3f8c91ef12.json
├── static-analysis/
│   └── analyze/
│       └── 7c4e2d1fa093.json
├── git/
│   └── logStats/
│       └── 9f1b3c5d7e2a.json
└── time-tracking/
    └── getTimeSheet/
        └── none.json
```

## Cache invalidation

For MVP, cache invalidation is manual: delete the cache files or the entire
`.cache/` directory. No TTL or timestamp-based expiry is implemented.

## Zod validation on read

When a Zod schema is provided to `getOrCompute()`, cached JSON is validated
on read. If validation fails (e.g. after a schema change), the stale entry is
treated as a cache miss: the compute function runs, the file is overwritten,
and the fresh result is returned.

## Design decisions

- **LLM responses are NOT cached** — they are non-deterministic.
- **Atomic writes** — cache files are written to a temp file, then renamed,
  to prevent corruption from interrupted writes.
- **Project-scoped location** — `data/<project>/.cache/` is already gitignored.
