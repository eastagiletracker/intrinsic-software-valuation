# QA Strategy

Testing philosophy, tier definitions, naming conventions, fixture provenance rules,
and concrete checklists for developers and agents working in this codebase.

## Guiding Principles

1. **Layer independence** (first priority): Every component must be fully covered by
   unit tests that touch no other package. A bug in a service must be diagnosable
   without running any client code.

2. **Fixture provenance** (second priority): Any mock data used in tests must be
   derived from a real system response — not invented. The origin of every fixture
   must be documented inside the fixture file or its generator script.

3. **Boundary coverage** (third priority): The seam between two layers is tested
   independently of both, using mocked adjacent components whose return values are
   backed by real fixture data.

4. **Realworld validation** (fourth priority): Clients carry one additional tier
   against real, gitignored project data to detect format drift between sanitized
   fixtures and live systems.

---

## The Four Tiers

### Tier 1 — Unit (`*.test.ts`)

**What it tests:** A single exported function, class, or schema. Zero I/O. Zero
cross-package imports. Input is pure data; output is asserted directly.

**Scope per layer:**

| Layer | What to unit-test |
|---|---|
| `clients/` | Adapter helper functions (date parsing, ID extraction, text classification), schema validation |
| `domain/` | Schema constraints, type narrowing, Zod refinements |
| `services/` | Pure calculation functions, decision logic, domain transformations |
| `pipelines/` | Orchestration helpers, configuration logic |

**Rules:**

- No file reads, no process spawning, no network calls.
- No cross-package mocks — if a collaborator lives in another package, this is the wrong tier.
- `vi.mock()` is permitted only for out-of-process I/O (e.g. `node:fs`) when strictly unavoidable.
- Prefer white-box assertions on return values over checking internal state.

---

### Tier 2 — Adapter Fixture (`*.adapter.test.ts`)

**What it tests:** A single adapter wired to a committed fixture file. Verifies the
full parse contract: raw file → normalized domain type. One real I/O call (local
file read), everything else in-process.

**Scope:** `clients/` only — adapter implementations.

**File placement:**

```
clients/src/jira/
  jira-xml.adapter.test.ts       ← Tier 2: tests jira-xml/adapter.ts against fixture
  jira-xml/
    __fixtures__/
      sample-export.xml          ← committed, anonymised fixture
      create-sample-export.ts    ← generator script (see Fixture Provenance Standard)
    adapter.ts
    adapter.test.ts              ← Tier 1: unit tests for adapter helper functions
```

**Rules:**

- The fixture file must include a provenance header (see Fixture Provenance Standard).
- Tests must cover the full parse contract: all supported fields, edge cases, and
  known quirks of the raw format.
- Failures here indicate a format assumption is wrong — check the generator script,
  not the test.

---

### Tier 3 — Component Boundary (`*.boundary.test.ts`)

**What it tests:** A complete component — from its public entry point through its
internal wiring — with all adjacent layers replaced by mocks. Tests that configuration
routing, port wiring, and domain mapping work end-to-end within a single package.

**Scope per layer:**

| Layer | Real code under test | Mocked boundary |
|---|---|---|
| `clients/` | Factory → port → adapter chain | Adapter return values mocked with fixture-derived data |
| `services/` | Service function + domain logic | Client ports mocked with fixture-derived data |
| `pipelines/` | Pipeline orchestration | Service ports mocked with fixture-derived data |

**Mock source rule:** Every `vi.fn()` return in a boundary test must carry a
`// derived from:` comment pointing to the fixture file the data originates from:

```typescript
mockGetTickets.mockResolvedValue(
  // derived from: clients/src/jira/jira-xml/__fixtures__/sample-export.xml
  [{ ticketId: "ACME-100", ... }],
);
```

**Execution:** Always included in `pnpm test`. Fast. No external dependencies.

---

### Tier 4 — Realworld (`*.realworld.test.ts`)

**What it tests:** The full client or pipeline against real, gitignored project data.
Detects format drift between committed fixtures and live system exports.

**Scope:** Primarily `clients/`. Optionally full pipeline smoke tests when a complete
project data set is available locally.

**Rules:**

- Guard with `describe.skipIf(!DATA_AVAILABLE)` so the test is always CI-safe.
- Document the required data file path in the guard block comment.
- Data files must be gitignored. Never commit real project data.
- Execution: `pnpm test:realworld` only (excluded from default `pnpm test`).

**Guard pattern:**

```typescript
// Requires: data/unicef/tickets/JIRA.xml (gitignored)
// Obtain by: exporting the project via Jira → Issues → Export XML
const DATA_FILE = resolve("data", "unicef", "tickets", "JIRA.xml");
const DATA_AVAILABLE = existsSync(DATA_FILE);

describe.skipIf(!DATA_AVAILABLE)("TicketClient — realworld", () => {
  // ...
});
```

---

## File Naming Quick Reference

| Pattern | Tier | Scope | Runs in |
|---|---|---|---|
| `*.test.ts` | 1 — Unit | Single class / function / schema | `pnpm test` |
| `*.adapter.test.ts` | 2 — Adapter fixture | Adapter + committed fixture file | `pnpm test` |
| `*.boundary.test.ts` | 3 — Component boundary | Full component, mocked seams | `pnpm test` |
| `*.realworld.test.ts` | 4 — Realworld | Real gitignored data, auto-skip | `pnpm test:realworld` |

The qualifier before `.test.ts` is the signal. No qualifier = unit test. The presence
of a qualifier immediately communicates scope, I/O expectations, and required data.

---

## Fixture Provenance Standard

Every committed fixture must document where it came from and how it was sanitized.

### Text / XML fixtures

Include a provenance comment block at the top of the file:

```xml
<!--
  Fixture: Jira RSS/XML export
  Source system: Jira (Issues → Export XML via project export)
  Format version: Jira RSS 0.92 / Atlassian JIRA 9.x
  Anonymisation: project keys → ACME-*, person names → fictional, company names → removed
  Generator: see jira-xml/__fixtures__/create-sample-export.ts
-->
```

### Binary fixtures (Excel, etc.)

The generator script (`create-*.ts`) is the provenance document. Its file header
must contain:

```typescript
/**
 * Fixture: Teamleader Focus time-tracking Excel export
 * Source system: Teamleader Focus (.xlsx export, "Worked time" report)
 * Format version: 2025 column layout (see EXPECTED_HEADERS in adapter.ts)
 * Anonymisation: project names → ACME-*, person names removed, client names removed
 *
 * Run:  npx tsx packages/clients/src/time-tracking/teamleader-excel/__fixtures__/create-sample-timesheet.ts
 */
```

### Derived mock provenance (Tier 3)

When a Tier 3 boundary test uses a mock that returns fixture-derived data, annotate
the mock value:

```typescript
mockParse.mockResolvedValue(
  // derived from: jira-xml/__fixtures__/sample-export.xml
  [ticket1, ticket2],
);
```

If no fixture exists yet, use the domain Zod schema to construct a minimal valid
value and mark it for later:

```typescript
mockGetTickets.mockResolvedValue(
  // TODO: derive from fixture when jira fixture is available
  [makeTicket({ ticketId: "ACME-100" })],
);
```

---

## Execution Scripts

| Script | Tiers run | Typical use |
|---|---|---|
| `pnpm test` | 1 + 2 + 3 | Default developer workflow, CI |
| `pnpm test:realworld` | 4 only | Local validation with real project data |
| `pnpm test:all` | 1 + 2 + 3 + 4 | Full local verification before release |
| `pnpm check` | — | TypeScript type validation only |

---

## Rules for Developers and Agents

### When adding a new client adapter

1. Write **Tier 1** unit tests (`adapter.test.ts` inside the adapter subfolder) for
   every helper function: date parsing, ID extraction, text classification, etc.
2. Create `__fixtures__/` with a sanitized fixture file and its generator script.
   Document provenance in the fixture header or generator script header.
3. Write a **Tier 2** `<adapter-name>.adapter.test.ts` one level above the adapter
   subfolder, covering the full parse contract against the committed fixture.
4. Wire the adapter into the factory and write a **Tier 3**
   `<client-name>.boundary.test.ts` at the client root.

### When adding a new service

1. Write **Tier 1** unit tests for all pure functions (`*.test.ts`).
2. Write a **Tier 3** `<service-name>.boundary.test.ts` that calls the service with
   mocked client ports.
3. Mock return values must be derived from existing `clients/**/__fixtures__/` data.
   Do not invent new domain type shapes — use the Zod schemas to construct minimal
   valid values, annotated with `// TODO: derive from fixture`.

### When adding a new pipeline

1. Write **Tier 1** unit tests for any orchestration helpers.
2. Write a **Tier 3** `<pipeline-name>.boundary.test.ts` mocking all service ports.
3. Service mock return values must be consistent with the shapes produced by
   existing service-level boundary tests.

### Do not

- Do not write a boundary test that touches a real file system or network.
- Do not invent mock data not backed by a fixture or domain schema.
- Do not place real project data (client names, real ticket IDs, real person names)
  in committed fixtures — always anonymise.
- Do not skip tiers — a working adapter with no Tier 1 unit tests is incomplete.
- Do not mix tiers in one file — a file named `*.adapter.test.ts` should not
  contain `vi.mock()` of cross-package modules.

---

## Current State (März 2026)

| Package | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| `clients/jira` | ✅ schemas, adapter helpers | ✅ `jira-xml.adapter.test.ts` | ✅ `jira.boundary.test.ts` | ✅ `jira.realworld.test.ts` |
| `clients/time-tracking` | ✅ schemas, adapter helpers | ✅ `teamleader-excel.adapter.test.ts` | ✅ `time-tracking.boundary.test.ts` | ✅ `time-tracking.realworld.test.ts` |
| `clients/llm` | ✅ schemas | ⬜ pending fixture | ✅ `integration.test.ts` (to rename) | ✅ `llm.realworld.test.ts` |
| `clients/git` | ✅ adapter, factory | ⬜ pending fixture | ⬜ pending | ✅ `git.realworld.test.ts` |
| `services/*` | ⬜ stubs | — | ⬜ pending | — |
| `pipelines/*` | ⬜ stubs | — | ⬜ pending | — |
