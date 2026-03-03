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
