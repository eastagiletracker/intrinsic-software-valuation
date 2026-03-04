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
| `query.schema.ts` | `TicketQuerySchema` — structured query criteria (all, byTicketNumbers, withSubtasks) |
| `index.ts` | Public re-exports for the module |
| `integration.test.ts` | Client-level integration tests using committed fixtures |
| `jira.realworld.test.ts` | Real-data tests using gitignored `data/` exports (skipped in CI) |
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
```
