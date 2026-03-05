# Time Tracking

Time-tracking client, port interface, schemas, and adapter implementations.

## Purpose

Provides a high-level `TimeTrackingClient` that abstracts raw format details and file discovery, exposing a clean query API for retrieving filtered time sheets. Supports multiple time-tracking sources (formats) in a single client via the `sources` configuration.

## Contents overview

| File / Folder | Description |
|---|---|
| `port.ts` | `TimeTrackingPort` interface — source-agnostic contract for adapters |
| `client.ts` | `TimeTrackingClient` interface — high-level query API |
| `factory.ts` | `createTimeTrackingClient(config)` — factory that resolves adapters and discovers files |
| `raw-format.schema.ts` | `TimeTrackingRawFormatSchema` — Zod enum of supported raw formats |
| `client-config.schema.ts` | `TimeTrackingClientConfigSchema` — project-specific configuration (single or multi-source) |
| `query.schema.ts` | `TimeTrackingQuerySchema` — structured filter criteria (ticket IDs, timeframe) |
| `index.ts` | Public re-exports for the module |
| `teamleader-excel/` | Adapter for Teamleader `.xlsx` exports |
| `teamleader-pdf/` | Adapter for Teamleader `.pdf` project exports |
| `projektron-bcs-excel/` | Adapter for Projektron BCS `.xlsx` invoice exports |
| `utils/` | Shared helper functions (`extractTicketIds`, `classifyAttribution`, `parseDateToIso`) |
| `teamleader-excel.adapter.test.ts` | Tier 2: Teamleader Excel adapter against committed fixture |
| `teamleader-pdf.adapter.test.ts` | Tier 2: Teamleader PDF adapter against committed fixture |
| `projektron-bcs-excel.adapter.test.ts` | Tier 2: Projektron BCS adapter against committed fixture |
| `time-tracking.boundary.test.ts` | Tier 3: full factory → client boundary tests |
| `time-tracking.realworld.test.ts` | Tier 4: real-data tests using gitignored `data/` exports (skipped in CI) |

## Supported formats

| Format | Adapter | Description |
|---|---|---|
| `teamleader-excel` | `TeamleaderExcelAdapter` | Teamleader working-hours Excel export |
| `teamleader-pdf` | `TeamleaderPdfAdapter` | Teamleader project time-tracking PDF export |
| `projektron-bcs-excel` | `ProjektronBcsExcelAdapter` | Projektron BCS "Nachweis gebuchter Aufwand für Rechnung" invoice export |

## How to use

### Single format (legacy)

```typescript
import { createTimeTrackingClient } from "@isv/clients";

const client = await createTimeTrackingClient({
  ticketPrefix: "PROJ",
  dataFolderName: "superclient",
  rawFormat: "teamleader-excel",
});
```

### Multi-source

```typescript
const client = await createTimeTrackingClient({
  ticketPrefix: "PROJ",
  dataFolderName: "superclient",
  sources: [
    { rawFormat: "teamleader-excel", subFolder: "teamleader" },
    { rawFormat: "projektron-bcs-excel", subFolder: "projektron-bcs" },
  ],
});
```

### Querying

```typescript
// Full time sheet (merged from all sources)
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
| `teamleader-excel/adapter.test.ts` | 1 — Unit | Teamleader Excel adapter helpers (date parsing, ID extraction, attribution) |
| `teamleader-pdf/adapter.test.ts` | 1 — Unit | Teamleader PDF adapter helpers (duration parsing) |
| `projektron-bcs-excel/adapter.test.ts` | 1 — Unit | Projektron BCS adapter helpers |
| `teamleader-excel.adapter.test.ts` | 2 — Adapter fixture | Teamleader Excel parse against `teamleader-excel/__fixtures__/sample-timesheet.xlsx` |
| `teamleader-pdf.adapter.test.ts` | 2 — Adapter fixture | Teamleader PDF parse against `teamleader-pdf/__fixtures__/sample-timesheet.pdf` |
| `projektron-bcs-excel.adapter.test.ts` | 2 — Adapter fixture | Projektron BCS parse against `projektron-bcs-excel/__fixtures__/sample-timesheet.xlsx` |
| `factory.test.ts` | 2/3 — Factory | Factory resolution, multi-source discovery, merging, filtering |
| `time-tracking.boundary.test.ts` | 3 — Component boundary | Factory → client wiring, single and multi-source, PDF coexistence |
| `time-tracking.realworld.test.ts` | 4 — Realworld | Real exports (auto-skipped when data absent) |
