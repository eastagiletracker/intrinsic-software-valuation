# Architectural Analysis: ISV Engine — High-Level Implementation Architecture

## Current Architecture Context

The repository is documentation-first with no committed tech stack. All domain knowledge lives in `docs/concept/` as six structured chapters covering the full ISV pipeline: Fact Finder (Architecture Scanner + Status Quo Miner), Gap Analyzer, Valuation Engine, and Historical Calibration.

The concept documents already imply clear bounded contexts and data contracts (TypeScript interfaces for `SystemContext`, `GapAnalysisResult`, `ShipUnitCluster`, `StandardizedTimeEntry`). No implementation code exists yet.

### Established patterns in concept docs

- **Pipeline pattern**: The engine runs as sequential phases (Fact Finder → Gap Analyzer → Valuation).
- **Adapter pattern**: External systems (Jira, LLM, Git) are referenced as swappable integrations.
- **Data contracts**: Every phase defines typed JSON input/output schemas.
- **Separation of deterministic vs. AI**: Phases 1 and 3 are deterministic scripts; Phase 2 uses an LLM.

## Architectural Mapping

### Concept-to-Component Mapping

Each concept chapter maps naturally to a distinct service with clear input/output boundaries:

| Concept Document | Component | Layer | Nature |
|---|---|---|---|
| Architecture Scanner (01) | `architecture-scanner` service | Services | LLM-assisted analysis |
| Status Quo Miner (01) | `status-quo-miner` service | Services | Deterministic metrics |
| Gap Analyzer (02) | `gap-analyzer` service | Services | LLM-assisted analysis |
| Valuation (02) | `valuation` service | Services | Deterministic formula |
| Historical Calibration (03) | `calibration` service | Services | Statistical analysis |
| Glossary (99) | `domain` layer | Domain | Shared vocabulary & types |

### External Dependencies (Client Layer)

The concept docs reference these external systems that need adapter abstractions:

| External System | Access Pattern | Referenced In |
|---|---|---|
| Jira (or other ticket systems) | REST API | Big Picture, Gap Analyzer, Calibration |
| LLM (e.g. GPT-4o) | API client | Architecture Scanner, Gap Analyzer |
| Git repositories | Local checkout or remote API | Status Quo Miner, Calibration |
| Time/booking data | File-based (CSV/JSON), gitignored | Calibration |
| Static analysis tools (`scc`, `jscpd`, etc.) | CLI wrappers | Status Quo Miner |

### Data Flow

```
Jira Client ──► ticket.json ──┐
                               │
Git Client ──► checkout ──► Status Quo Miner ──► system_context_{t}.json ──┐
                       └──► Architecture Scanner ──► system_context.json ──┤
                                                                           │
                                          ┌────────────────────────────────┘
                                          ▼
                                    Gap Analyzer ──► gap_analysis.json
                                          │
                                          ▼
                                   Valuation Engine ──► isv_score
                                          │
Time Tracking Client ──► entries.json ──┐ │
                                        ▼ ▼
                                    Calibration ──► ship_rate
```

## Initial Folder Structure (Superseded)

> **Note:** The original four-layer structure (`domain/`, `clients/`, `services/`, `pipeline/`) has been revised after use-case analysis. See **Revised Folder Structure** below for the current proposal.

### Layer Responsibilities (Original)

Retained for reference — the core layers (`domain/`, `clients/`, `services/`) remain unchanged. `pipeline/` has been split into `pipelines/` + `interfaces/`.

| Layer | Responsibility | Depends On | Key Pattern |
|---|---|---|---|
| `domain/` | Define shared language: interfaces, types, enums | Nothing | Module pattern, shared kernel |
| `clients/` | Technical access to external systems and data | `domain/` | Adapter pattern, gateway pattern |
| `services/` | Business logic, orchestration of one ISV phase | `domain/`, `clients/` | Service layer, strategy pattern |
| `pipeline/` | End-to-end workflow sequencing | `services/` | Pipeline pattern |
| `data/` | Local, gitignored data files for time tracking | Nothing | Convention over configuration |

### Dependency Rule

Dependencies flow **inward and downward** only:

```
pipeline/ ──► services/ ──► clients/ ──► (external systems)
                 │               │
                 └──► domain/ ◄──┘
```

`domain/` has **zero** dependencies on other layers. `clients/` and `services/` both depend on `domain/` for shared types. `pipeline/` depends on `services/` but never directly on `clients/`.

## Fit Assessment

The proposed structure maps naturally to the existing concept documents:

- **Strong fit**: Each concept chapter becomes one service. The interfaces already defined in the concept docs (TypeScript) translate directly into the `domain/` layer.
- **Strong fit**: The separation between deterministic phases (Status Quo Miner, Valuation) and AI phases (Architecture Scanner, Gap Analyzer) is preserved — both live in `services/` but use different `clients/`.
- **Strong fit**: The adapter pattern for external systems (Jira, LLM, Git) is already implied by the concepts and becomes explicit in `clients/`.
- **Intentional gap**: The `pipeline/` layer is kept thin for now — orchestration details (CI triggers, Jira status webhooks) can be designed once the individual services exist.

## Gaps Identified

1. **No tech stack decision yet**: Language, runtime, package manager, and test framework need to be chosen before implementation begins.
2. **No configuration/secrets management**: LLM API keys, Jira credentials, Git tokens need a pattern (env vars, config files, secret store).
3. **No error handling pattern**: The concept docs mention quality gates (confidence score < 0.7, ticket not actionable) but no cross-cutting error/retry strategy.
4. **No persistence layer**: The pipeline produces JSON artifacts — where are they stored between phases? File system? Database? In-memory?
5. **No observability**: Logging, metrics, and tracing are not yet addressed.
6. **`data/` folder convention**: The time tracking data format and parsing rules are defined in the Calibration concept but the ingestion workflow (manual drop vs. automated pull) is undefined.

## Proposed Solutions

## Use-Case Analysis: Two Distinct Operation Modes

The ISV Engine has two fundamentally different use cases that share the same core services but differ in scope, data requirements, and delivery mechanism.

### Use Case 1: Historical Calibration (Batch)

**Trigger:** Manual or scheduled run over a time window (e.g. last 18 months).

**Flow:**
```
Jira Client ──► ticket stream ──► cluster aggregation
Git Client  ──► historical checkouts (T0 per cluster)
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
  Status Quo Miner      Architecture Scanner
          │                       │
          └───────┬───────────────┘
                  ▼
            Gap Analyzer (per cluster)
                  │
                  ▼
           Valuation (per cluster)
                  │
Time Tracking ──► │
                  ▼
           Calibration ──► ship_rate, reports, correlation data
```

**Characteristics:**
- Processes many tickets/clusters in a batch loop.
- Requires **all** services including calibration.
- Requires **all** clients including time-tracking parser.
- Output: statistical reports, ship rate, $R^2$ correlation.
- Likely delivery: **CLI command** or **scheduled job** (CI pipeline, cron).

### Use Case 2: Standalone ISV Calculation (On-Demand)

**Trigger:** Single ticket arrives (e.g. Jira webhook, manual API call, MCP tool invocation).

**Flow:**
```
ticket.json (input) ──┐
                       │
Git Client ──► static T0 checkout
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
  Status Quo Miner      Architecture Scanner
          │                       │
          └───────┬───────────────┘
                  ▼
            Gap Analyzer
                  │
                  ▼
           Valuation ──► ISV score + gap report
```

**Characteristics:**
- Processes **one ticket** at a time — request/response pattern.
- Does **not** need calibration, time tracking, or code-change analysis.
- Subset of clients: Jira (or raw input), LLM, Git, static analysis. No time-tracking parser.
- Output: single ISV score + structured gap analysis JSON.
- Likely delivery: **REST API**, **MCP server**, or **CLI single-run**.

### Architectural Implication

The current `pipeline/` layer assumes one monolithic flow. The two use cases reveal that:

1. **Services are reusable** — the same `gap-analyzer` or `valuation` service works in both modes.
2. **Orchestration differs** — batch iteration with aggregation vs. single request/response.
3. **Delivery differs** — CLI/cron vs. HTTP API/MCP server.
4. **Client subset differs** — calibration needs time-tracking; standalone does not.

This means we need to split what was a single `pipeline/` into two concerns:

- **Pipelines** (use-case orchestration): how services are composed and sequenced for a specific use case.
- **Interfaces** (delivery mechanism): how the outside world triggers a pipeline and receives results.

## Revised Folder Structure

```
src/
├── README.md
├── domain/                    # Shared types, interfaces, schemas
│   └── README.md
│
├── clients/                   # External system adapters (technical focus)
│   ├── README.md
│   ├── jira/
│   ├── llm/
│   ├── git/
│   ├── time-tracking/
│   └── static-analysis/
│
├── services/                  # Business logic (domain focus, stateless)
│   ├── README.md
│   ├── architecture-scanner/
│   ├── status-quo-miner/
│   ├── gap-analyzer/
│   ├── valuation/
│   └── calibration/
│
├── pipelines/                 # Use-case orchestration (composes services)
│   ├── README.md
│   ├── isv-calculation/       # UC2: single-ticket ISV score
│   │   └── README.md
│   └── historical-calibration/# UC1: batch calibration run
│       └── README.md
│
└── interfaces/                # Delivery mechanisms (how the world calls us)
    ├── README.md
    ├── cli/                   # Command-line entry points
    │   └── README.md
    └── api/                   # REST API / MCP server
        └── README.md

data/                          # Gitignored: local time tracking files, exports
├── README.md
└── .gitkeep
```

### Updated Layer Responsibilities

| Layer | Responsibility | Depends On | Key Pattern |
|---|---|---|---|
| `domain/` | Shared language: interfaces, types, enums | Nothing | Shared kernel |
| `clients/` | Technical access to external systems | `domain/` | Adapter pattern, gateway |
| `services/` | Business logic for one ISV phase (stateless) | `domain/`, `clients/` | Service layer |
| `pipelines/` | Compose services into use-case workflows | `domain/`, `services/` | Pipeline pattern, facade |
| `interfaces/` | Expose pipelines to the outside world | `domain/`, `pipelines/` | Interface adapter, controller |
| `data/` | Local gitignored data files | Nothing | Convention |

### Updated Dependency Rule

```
interfaces/ ──► pipelines/ ──► services/ ──► clients/ ──► (external)
                    │              │              │
                    └──► domain/ ◄─┴──────────────┘
```

Key constraints:
- `interfaces/` never calls `services/` or `clients/` directly — always through a pipeline.
- `pipelines/` never calls `clients/` directly — always through a service.
- `domain/` has zero dependencies.

### Pipeline Layer Detail

Each pipeline is a **facade** that wires together the right services for one use case:

**`isv-calculation` pipeline:**
- Input: ticket data (raw JSON or Jira ticket ID) + repository reference(s)
- Orchestrates: Architecture Scanner → Status Quo Miner → Gap Analyzer → Valuation
- Output: `GapAnalysisResult` + ISV score
- Does **not** touch: calibration, time-tracking

**`historical-calibration` pipeline:**
- Input: date range + repository list + Jira project filter
- Orchestrates: Jira ticket stream → cluster aggregation → (per cluster: T0 checkout → Status Quo Miner → Architecture Scanner → Gap Analyzer → Valuation) → time tracking correlation → calibration
- Output: ship rate, correlation report, per-cluster ISV data
- Uses **all** services and clients

### Interface Layer Detail

The interface layer adapts external protocols to pipeline calls. Each interface is thin — it handles request parsing, authentication, and response formatting but contains zero business logic.

| Interface | Protocol | Primary Pipeline | Pattern |
|---|---|---|---|
| `cli/` | Command line (stdin/argv) | Both | Command pattern |
| `api/` | HTTP REST or MCP server | Primarily `isv-calculation` | Controller/handler pattern |

**Why MCP fits Use Case 2:**
- MCP (Model Context Protocol) exposes tools that an LLM or agent can invoke.
- The standalone ISV calculation is a natural "tool": give me a ticket, get back a score.
- MCP server wraps the `isv-calculation` pipeline as one or more tools.

**Why REST API fits Use Case 2:**
- Jira webhooks or CI pipelines can POST a ticket ID and receive the ISV score as JSON.
- Standard HTTP semantics; easy to integrate with any automation.

**Why CLI fits both:**
- `isv calculate --ticket PROJ-123` → runs `isv-calculation` pipeline
- `isv calibrate --project PROJ --from 2024-01 --to 2025-06` → runs `historical-calibration` pipeline

## Revised Proposed Solutions

### Option A: Layered with Pipelines + Interfaces (Recommended)

**Approach:** Five layers as described above: `domain/` → `clients/` → `services/` → `pipelines/` → `interfaces/`.

**Pattern:** Layered architecture with facade pipelines and pluggable interface adapters.

**Pros:**

- Clear separation between "what happens" (pipelines) and "how it's triggered" (interfaces).
- Adding a new use case = adding a new pipeline folder, not restructuring.
- Adding a new delivery mechanism (e.g. GraphQL, Slack bot) = adding a new interface folder.
- Services remain stateless and reusable across all pipelines.
- Each layer is independently testable.

**Cons:**

- Five layers may feel over-engineered for the initial phase.
- Pipeline abstraction adds a thin indirection layer.

**Impact:** Replaces single `pipeline/` with `pipelines/` (plural, use-case-scoped) + `interfaces/` (delivery).

**Effort:** Low (folder structure + READMEs; no code yet).

---

### Option B: Single Pipeline with Modes

**Approach:** Keep one `pipeline/` layer but introduce a "mode" parameter (e.g. `--mode calculate` vs. `--mode calibrate`). Interface code lives inside `pipeline/`.

**Pattern:** Strategy pattern within a monolithic pipeline.

**Pros:**

- Fewer folders and layers initially.
- Quicker to scaffold.

**Cons:**

- Conflates orchestration logic with delivery mechanism.
- Mode-switching inside one pipeline leads to growing conditionals.
- Adding REST API or MCP server means mixing HTTP handling into the pipeline layer.
- Harder to test use cases independently.

**Impact:** Keeps existing `pipeline/` structure.

**Effort:** Low initially, but grows as use cases diverge.

---

### Recommendation

**Option A (Layered with Pipelines + Interfaces)** because:

1. The two use cases are structurally different (batch vs. request/response) — they deserve separate orchestration.
2. REST API / MCP server is clearly a different concern from CLI — mixing them into one layer creates coupling.
3. The extra layer cost is minimal (two additional folders with READMEs) but the separation pays off immediately when the first interface (CLI or API) is built.
4. This pattern is well-established (Hexagonal Architecture / Ports & Adapters) and aligns with the adapter pattern already used in `clients/`.

## Integration Points

| File/Folder | Action | Notes |
|---|---|---|
| `src/` (new) | Create with README | Top-level source root |
| `src/domain/` (new) | Create with README + interfaces | Derived from concept doc TypeScript schemas |
| `src/clients/` (new) | Create with README + subfolders | One subfolder per external system |
| `src/services/` (new) | Create with README + subfolders | One subfolder per ISV phase |
| `src/pipelines/` (new) | Create with README + 2 subfolders | One per use case |
| `src/interfaces/` (new) | Create with README + subfolders | `cli/` and `api/` |
| `data/` (new) | Create with README + `.gitkeep` + `.gitignore` entry | Local time tracking data |
| `README.md` | Update | Add `src/` and `data/` to overview |
| `CONTRIBUTING.md` | Update | Add `src/` structure conventions |
| `CONTRIBUTING.md` | Update | Add `src/` structure conventions |
| `docs/concept/README.md` | No change | Concept docs remain as-is |

## Open Questions

1. ~~**Tech stack**: Which language/runtime?~~ → **Decided:** TypeScript, Node.js 24 LTS, pnpm. See [techstack.md](techstack.md).
2. **Persistence between phases**: File-based JSON artifacts on disk, or in-memory pipeline? → **Needs human decision.**
3. **Time tracking ingestion**: Manual file drop into `data/` or automated pull from an external system? → **Needs human decision** (concept doc describes file-based).
4. ~~**Monorepo vs. multi-repo**~~ → **Decided:** pnpm workspace monorepo. Each architecture layer is a separate package (`@isv/domain`, `@isv/clients`, `@isv/services`, `@isv/pipelines`). See [techstack.md](techstack.md).
5. **CI/CD integration**: The Big Picture mentions GitHub Actions / GitLab CI — which platform? → **Needs human decision** before `pipeline/` design.
