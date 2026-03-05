# Jira

Jira ticket client, port interface, schemas, and adapter implementations.

## Purpose

Provides a high-level `TicketClient` that abstracts raw format details and file discovery, exposing a clean query API for retrieving normalised tickets from Jira exports.

## Contents overview

| File / Folder | Description |
|---|---|
| `port.ts` | `TicketPort` interface — source-agnostic contract for ticket adapters |
| `client.ts` | `TicketClient` interface — high-level query API returning `Result<Ticket[]>` |
| `factory.ts` | `createTicketClient(config)` — factory that resolves adapters and discovers files |
| `raw-format.schema.ts` | `TicketRawFormatSchema` — Zod enum of supported raw formats |
| `client-config.schema.ts` | `TicketClientConfigSchema` — project-specific configuration for the factory |
| `query.schema.ts` | `TicketQuerySchema` — structured query criteria (all, byTicketNumbers, withSubtasks) with optional timeframe filter |
| `index.ts` | Public re-exports for the module |
| `jira-xml.adapter.test.ts` | Tier 2: adapter wired against committed XML fixture |
| `jira.boundary.test.ts` | Tier 3: full factory → client, mocked boundary |
| `jira.realworld.test.ts` | Tier 4: real-data tests using gitignored `data/` exports (skipped in CI) |
| `jira-xml/` | Adapter for Jira RSS/XML exports |

## How to use

```typescript
import { createTicketClient } from "@isv/clients";

const client = await createTicketClient({
  dataFolderName: "superclient",
  ticketPrefix: "PROJ",
  rawFormat: "jira-xml",
});

// All tickets
const all = await client.getTickets();

// Filter by ticket numbers
const byIds = await client.getTickets({
  mode: "byTicketNumbers",
  ticketIds: ["PROJ-123", "PROJ-456"],
});

// Parent tickets + their direct subtasks (cluster resolution)
const withSubs = await client.getTickets({
  mode: "withSubtasks",
  parentIds: ["PROJ-100"],
});

// All tickets within a timeframe
const byTimeframe = await client.getTickets({
  mode: "all",
  timeframe: {
    start: "2025-01-01T00:00:00.000Z",
    end: "2025-06-30T23:59:59.000Z",
  },
});
```

## Testing

This client has full four-tier test coverage. See [`docs/qa-strategy.md`](../../../../../docs/qa-strategy.md) for the strategy and rules.

| File | Tier | Description |
|---|---|---|
| `jira-xml/adapter.test.ts` | 1 — Unit | Adapter helper functions (date parsing, XML extraction) |
| `jira-xml.adapter.test.ts` | 2 — Adapter fixture | Full parse contract against `jira-xml/__fixtures__/sample-export.xml` |
| `jira.boundary.test.ts` | 3 — Component boundary | Factory → client wiring, fixture-derived mocks |
| `jira.realworld.test.ts` | 4 — Realworld | Real Jira XML export, auto-skipped when data absent |
