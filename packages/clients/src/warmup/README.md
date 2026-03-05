# Warmup

SQLite-based data warmup for ticket and time-tracking data.

## Purpose

Parses all raw source files (Jira XML, Teamleader Excel) once, deduplicates
them, and persists the normalized data into a project-local SQLite database
at `data/<slug>/project.db`. Subsequent pipeline queries read from the
indexed SQLite database instead of re-parsing XML/Excel on every invocation.

## Contents

| File | Description |
|---|---|
| `warmup.ts` | `warmupProjectData()` — main warmup entry point |
| `index.ts` | Public barrel exports |

## Usage

### CLI

```bash
isv init --warmup --project <slug>
```

### Programmatic

```typescript
import { warmupProjectData } from "@isv/clients";

const result = await warmupProjectData({
  projectSlug: "my-project",
  cwd: "/path/to/monorepo",
  jiraConfig: {
    rawFormat: "jira-xml",
    dataFolderName: "my-project",
    ticketPrefix: "PROJ",
  },
  timeTrackingConfig: {
    rawFormat: "teamleader-excel",
    dataFolderName: "my-project",
  },
  onProgress: (event) => console.log(event.phase, event.detail),
});

console.log(`Warmed up ${result.ticketCount} tickets, ${result.timeEntryCount} time entries`);
```

## Data flow

```text
Warmup (once per data change):
  Raw files (XML, XLSX)
    → Adapter.parse() per file
    → Deduplicate / validate
    → INSERT into SQLite tables
    → data/<slug>/project.db

Pipeline queries (fast, indexed):
  SqliteTicketClient.getTickets(query)
    → SQL SELECT with WHERE clauses
    → Domain objects
    → Pipeline consumer
```

## Staleness detection

The warmup process records source file metadata (path, mtime, size) in the
`warmup_meta` table. When a SQLite client is constructed, it compares current
file metadata against stored values and logs a warning if any files have
changed. Users must explicitly re-run `isv init --warmup` to refresh.
