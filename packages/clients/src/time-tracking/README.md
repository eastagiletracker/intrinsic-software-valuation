# Time Tracking

Time-tracking client, port interface, schemas, and adapter implementations.

## Purpose

Provides a high-level `TimeTrackingClient` that abstracts raw format details and file discovery, exposing a clean query API for retrieving filtered time sheets.

## Contents overview

| File / Folder | Description |
|---|---|
| `port.ts` | `TimeTrackingPort` interface — source-agnostic contract for adapters |
| `client.ts` | `TimeTrackingClient` interface — high-level query API |
| `factory.ts` | `createTimeTrackingClient(config)` — factory that resolves adapters and discovers files |
| `raw-format.schema.ts` | `TimeTrackingRawFormatSchema` — Zod enum of supported raw formats |
| `client-config.schema.ts` | `TimeTrackingClientConfigSchema` — project-specific configuration for the factory |
| `query.schema.ts` | `TimeTrackingQuerySchema` — structured filter criteria (ticket IDs, timeframe) |
| `index.ts` | Public re-exports for the module |
| `teamleader-excel.adapter.test.ts` | Tier 2: adapter wired against committed Excel fixture |
| `time-tracking.boundary.test.ts` | Tier 3: full factory → client, mocked boundary |
| `time-tracking.realworld.test.ts` | Tier 4: real-data tests using gitignored `data/` exports (skipped in CI) |
| `teamleader-excel/` | Adapter for Teamleader `.xlsx` exports |

## How to use

```typescript
import { createTimeTrackingClient } from "@isv/clients";

const client = await createTimeTrackingClient({
  ticketPrefix: "PROJ",
  dataFolderName: "superclient",
  rawFormat: "teamleader-excel",
});

// Full time sheet
const all = await client.getTimeSheet();

// Filtered by tickets
const byTicket = await client.getTimeSheet({
  ticketIds: ["PROJ-123", "PROJ-456"],
});

// Filtered by timeframe
const byTime = await client.getTimeSheet({
  timeframe: {
    start: "2025-01-01T00:00:00Z",
    end: "2025-06-30T23:59:59Z",
  },
});
```

## Testing

This client has full four-tier test coverage. See [`docs/qa-strategy.md`](../../../../../docs/qa-strategy.md) for the strategy and rules.

| File | Tier | Description |
|---|---|---|
| `teamleader-excel/adapter.test.ts` | 1 — Unit | Adapter helper functions (date parsing, ID extraction, attribution) |
| `teamleader-excel.adapter.test.ts` | 2 — Adapter fixture | Full parse contract against `teamleader-excel/__fixtures__/sample-timesheet.xlsx` |
| `time-tracking.boundary.test.ts` | 3 — Component boundary | Factory → client wiring, fixture-derived mocks |
| `time-tracking.realworld.test.ts` | 4 — Realworld | Real Teamleader export, auto-skipped when data absent |
